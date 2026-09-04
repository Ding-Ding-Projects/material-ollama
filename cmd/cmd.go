package cmd

import (
	"bufio"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	_ "embed"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"log/slog"
	"math"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"regexp"
	"runtime"
	"slices"
	"sort"
	"strconv"
	"strings"
	"sync/atomic"
	"syscall"
	"text/tabwriter"
	"time"

	"github.com/containerd/console"
	"github.com/mattn/go-runewidth"
	"github.com/olekukonko/tablewriter"
	"github.com/pkg/browser"
	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
	"golang.org/x/crypto/ssh"
	"golang.org/x/sync/errgroup"
	"golang.org/x/term"
	"gonum.org/v1/gonum/mat"
	"gonum.org/v1/gonum/stat"
	"gonum.org/v1/plot"
	"gonum.org/v1/plot/plotter"
	"gonum.org/v1/plot/vg"

	agentstore "github.com/ollama/ollama/agent/store"
	"github.com/ollama/ollama/api"
	"github.com/ollama/ollama/cmd/config"
	"github.com/ollama/ollama/cmd/launch"
	"github.com/ollama/ollama/cmd/tui"
	"github.com/ollama/ollama/discover"
	"github.com/ollama/ollama/envconfig"
	"github.com/ollama/ollama/format"
	"github.com/ollama/ollama/internal/modelref"
	"github.com/ollama/ollama/logutil"
	"github.com/ollama/ollama/parser"
	"github.com/ollama/ollama/progress"
	"github.com/ollama/ollama/runner"
	"github.com/ollama/ollama/server"
	"github.com/ollama/ollama/types/errtypes"
	"github.com/ollama/ollama/types/model"
	"github.com/ollama/ollama/version"
	xcreate "github.com/ollama/ollama/x/create"
	xcreateclient "github.com/ollama/ollama/x/create/client"
)

func init() {
	// Override default selectors to use Bubbletea TUI instead of raw terminal I/O.
	launch.DefaultSingleSelector = func(title string, items []launch.SelectionItem, current string) (string, error) {
		return runTUISingleSelector(title, items, current, nil)
	}

	launch.DefaultSingleSelectorWithUpdates = func(title string, items []launch.SelectionItem, current string, updates <-chan []launch.SelectionItem) (string, error) {
		return runTUISingleSelector(title, items, current, updates)
	}

	launch.DefaultMultiSelector = func(title string, items []launch.SelectionItem, preChecked []string) ([]string, error) {
		return runTUIMultiSelector(title, items, preChecked, nil)
	}

	launch.DefaultMultiSelectorWithUpdates = func(title string, items []launch.SelectionItem, preChecked []string, updates <-chan []launch.SelectionItem) ([]string, error) {
		return runTUIMultiSelector(title, items, preChecked, updates)
	}

	launch.DefaultSignIn = func(modelName, signInURL string) (string, error) {
		userName, err := tui.RunSignIn(modelName, signInURL)
		if errors.Is(err, tui.ErrCancelled) {
			return "", launch.ErrCancelled
		}
		return userName, err
	}

	launch.DefaultUpgrade = func(modelName, requiredPlan string) (string, error) {
		plan, err := tui.RunUpgrade(modelName, requiredPlan)
		if errors.Is(err, tui.ErrCancelled) {
			return "", launch.ErrCancelled
		}
		return plan, err
	}

	launch.DefaultConfirmPrompt = tui.RunConfirmWithOptions

	launch.DefaultCloudSuggest = func(ctx context.Context, client *api.Client, model string, pullErr error) (string, error) {
		return suggestCloudModel(ctx, client, model, pullErr, false, func(cloudName string) string {
			return "--model " + cloudName
		})
	}

	launch.DefaultSpinner = tui.RunSpinner
}

func runTUISingleSelector(title string, items []launch.SelectionItem, current string, updates <-chan []launch.SelectionItem) (string, error) {
	if !term.IsTerminal(int(os.Stdin.Fd())) || !term.IsTerminal(int(os.Stdout.Fd())) {
		return "", fmt.Errorf("model selection requires an interactive terminal; use --model to run in headless mode")
	}
	tuiItems := tui.ReorderItems(tui.ConvertItems(items))
	result, err := tui.SelectSingleWithUpdates(title, tuiItems, current, convertSelectionItemUpdates(updates))
	if errors.Is(err, tui.ErrCancelled) {
		return "", launch.ErrCancelled
	}
	return result, err
}

func runTUIMultiSelector(title string, items []launch.SelectionItem, preChecked []string, updates <-chan []launch.SelectionItem) ([]string, error) {
	if !term.IsTerminal(int(os.Stdin.Fd())) || !term.IsTerminal(int(os.Stdout.Fd())) {
		return nil, fmt.Errorf("model selection requires an interactive terminal; use --model to run in headless mode")
	}
	tuiItems := tui.ReorderItems(tui.ConvertItems(items))
	result, err := tui.SelectMultipleWithUpdates(title, tuiItems, preChecked, convertSelectionItemUpdates(updates))
	if errors.Is(err, tui.ErrCancelled) {
		return nil, launch.ErrCancelled
	}
	return result, err
}

func convertSelectionItemUpdates(updates <-chan []launch.SelectionItem) <-chan []tui.SelectItem {
	if updates == nil {
		return nil
	}
	out := make(chan []tui.SelectItem, 1)
	go func() {
		defer close(out)
		for items := range updates {
			out <- tui.ReorderItems(tui.ConvertItems(items))
		}
	}()
	return out
}

const ConnectInstructions = "If your browser did not open, navigate to:\n    %s\n\n"

// ensureThinkingSupport emits a warning if the model does not advertise thinking support
func ensureThinkingSupport(ctx context.Context, client *api.Client, name string) {
	if name == "" {
		return
	}
	resp, err := client.Show(ctx, &api.ShowRequest{Model: name})
	if err != nil {
		return
	}
	if slices.Contains(resp.Capabilities, model.CapabilityThinking) {
		return
	}
	fmt.Fprintf(os.Stderr, "warning: model %q does not support thinking output\n", name)
}

var errModelfileNotFound = errors.New("specified Modelfile wasn't found")

func getModelfileName(cmd *cobra.Command) (string, error) {
	filename, _ := cmd.Flags().GetString("file")

	if filename == "" {
		filename = "Modelfile"
	}

	absName, err := filepath.Abs(filename)
	if err != nil {
		return "", err
	}

	_, err = os.Stat(absName)
	if err != nil {
		return "", err
	}

	return absName, nil
}

// isLocalhost returns true if the configured Ollama host is a loopback or unspecified address.
func isLocalhost() bool {
	host := envconfig.Host()
	h, _, _ := net.SplitHostPort(host.Host)
	if h == "localhost" {
		return true
	}
	ip := net.ParseIP(h)
	return ip != nil && (ip.IsLoopback() || ip.IsUnspecified())
}

func resolveExperimentalLocalModelDir(ref, filename string) string {
	if ref == "" || filepath.IsAbs(ref) || filename == "" {
		return ref
	}

	candidate := filepath.Join(filepath.Dir(filename), ref)
	if xcreate.IsSafetensorsModelDir(candidate) {
		return candidate
	}

	return ref
}

func resolveExperimentalDraftDir(ref, filename string) (string, error) {
	if ref == "" {
		return "", nil
	}
	if filepath.IsAbs(ref) {
		if xcreate.IsSafetensorsModelDir(ref) {
			return ref, nil
		}
		return "", fmt.Errorf("draft %s is not a supported safetensors model directory", ref)
	}
	if filename != "" {
		candidate := filepath.Join(filepath.Dir(filename), ref)
		if xcreate.IsSafetensorsModelDir(candidate) {
			return candidate, nil
		}
	}

	return "", fmt.Errorf("DRAFT model references are not supported with --experimental yet: %s", ref)
}

func CreateHandler(cmd *cobra.Command, args []string) error {
	p := progress.NewProgress(os.Stderr)
	defer p.Stop()

	// Validate model name early to fail fast
	modelName := args[0]
	name := model.ParseName(modelName)
	if !name.IsValid() {
		return fmt.Errorf("invalid model name: %s", modelName)
	}

	// Check for --experimental flag for safetensors model creation.
	experimental, _ := cmd.Flags().GetBool("experimental")
	draftQuantize, _ := cmd.Flags().GetString("draft-quantize")
	if experimental {
		if !isLocalhost() {
			return errors.New("remote safetensor model creation not yet supported")
		}

		// Get Modelfile content - either from -f flag or default to "FROM ."
		var reader io.Reader
		filename, err := getModelfileName(cmd)
		if os.IsNotExist(err) || filename == "" {
			// No Modelfile specified or found - use default
			reader = strings.NewReader("FROM .\n")
		} else if err != nil {
			return err
		} else {
			f, err := os.Open(filename)
			if err != nil {
				return err
			}
			defer f.Close()
			reader = f
		}

		// Parse the Modelfile
		modelfile, err := parser.ParseFile(reader)
		if err != nil {
			return fmt.Errorf("failed to parse Modelfile: %w", err)
		}

		modelDir, mfConfig, err := xcreateclient.ConfigFromModelfile(modelfile)
		if err != nil {
			return err
		}

		modelDir = resolveExperimentalLocalModelDir(modelDir, filename)
		if mfConfig.Draft != "" {
			draftDir, err := resolveExperimentalDraftDir(mfConfig.Draft, filename)
			if err != nil {
				return err
			}
			mfConfig.Draft = draftDir
		}

		quantize, _ := cmd.Flags().GetString("quantize")
		return xcreateclient.CreateModel(xcreateclient.CreateOptions{
			ModelName:     modelName,
			ModelDir:      modelDir,
			Quantize:      quantize,
			DraftQuantize: draftQuantize,
			Modelfile:     mfConfig,
		}, p)
	}

	// Standard Modelfile + API path
	var reader io.Reader

	filename, err := getModelfileName(cmd)
	if os.IsNotExist(err) {
		if filename == "" {
			reader = strings.NewReader("FROM .\n")
		} else {
			return errModelfileNotFound
		}
	} else if err != nil {
		return err
	} else {
		f, err := os.Open(filename)
		if err != nil {
			return err
		}

		reader = f
		defer f.Close()
	}

	var r, fallback io.Reader
	switch filename {
	case "-":
		r = os.Stdin
	case "":
		filename = "Modelfile"
		fallback = strings.NewReader("FROM .")
		fallthrough
	default:
		r, err = os.Open(filename)
		if errors.Is(err, os.ErrNotExist) && fallback != nil {
			r = fallback
		} else if errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("%w: Modelfile %q does not exist, please create it or use --file to specify a different file", err, filename)
		} else if err != nil {
			return err
		} else {
			defer r.(*os.File).Close()
		}
	}

	modelfile, err := parser.ParseFile(r)
	if err != nil {
		return err
	}

	// Check if this is a tensor model (image generation) and handle it directly
	quantize, _ := cmd.Flags().GetString("quantize")
	modelDir := filepath.Dir(filename)
	for _, cmd := range modelfile.Commands {
		if cmd.Name == "model" {
			if filepath.IsAbs(cmd.Args) {
				modelDir = cmd.Args
			} else {
				modelDir = filepath.Join(filepath.Dir(filename), cmd.Args)
			}
			break
		}
	}
	if create.IsTensorModelDir(modelDir) {
		return xcreateclient.CreateModel(xcreateclient.CreateOptions{
			ModelName: modelName,
			ModelDir:  modelDir,
			Quantize:  quantize,
			Modelfile: xcreateclient.ExtractModelfileConfig(modelfile),
		}, p)
	}

	status := "gathering model components"
	spinner := progress.NewSpinner(status)
	p.Add(status, spinner)

	req, err := modelfile.CreateRequest(filepath.Dir(filename))
	if err != nil {
		return err
	}

	req.Model = modelName
	if quantize != "" {
		req.Quantize = quantize
	}
	if draftQuantize != "" {
		if len(req.DraftFiles) == 0 {
			return errors.New("--draft-quantize requires a DRAFT model")
		}
		req.DraftQuantize = draftQuantize
	}

	client, err := api.ClientFromEnvironment()
	if err != nil {
		return err
	}

	var g errgroup.Group
	g.SetLimit(runtime.GOMAXPROCS(0))
	for blob, err := range createBlobs(req.Files, req.Adapters) {
		if err != nil {
			return err
		}

	files := syncmap.NewSyncMap[string, string]()
	fileNames := createRequestFileNames(req.Files)
	for f, digest := range req.Files {
		g.Go(func() error {
			if _, err := createBlob(cmd, client, f, digest, p); err != nil {
				return err
			}

			files.Store(fileNames[f], digest)
			return nil
		})

	adapters := syncmap.NewSyncMap[string, string]()
	adapterNames := createRequestFileNames(req.Adapters)
	for f, digest := range req.Adapters {
		g.Go(func() error {
			if _, err := createBlob(cmd, client, f, digest, p); err != nil {
				return err
			}

			adapters.Store(adapterNames[f], digest)
			return nil
		})
	}

	draftFiles := syncmap.NewSyncMap[string, string]()
	draftFileNames := createRequestFileNames(req.DraftFiles)
	for f, digest := range req.DraftFiles {
		g.Go(func() error {
			if _, err := createBlob(cmd, client, f, digest, p); err != nil {
				return err
			}

			draftFiles.Store(draftFileNames[f], digest)
			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return err
	}

	req.Files = files.Items()
	req.Adapters = adapters.Items()
	req.DraftFiles = draftFiles.Items()

	bars := make(map[string]*progress.Bar)
	var quantizeSpin *progress.Spinner
	fn := func(resp api.ProgressResponse) error {
		if resp.Digest != "" {
			bar, ok := bars[resp.Digest]
			if !ok {
				msg := resp.Status
				if msg == "" {
					msg = fmt.Sprintf("pulling %s...", resp.Digest[7:19])
				}
				bar = progress.NewBar(msg, resp.Total, resp.Completed)
				bars[resp.Digest] = bar
				p.Add(resp.Digest, bar)
			}

			bar.Set(resp.Completed)
		} else if strings.Contains(resp.Status, "quantizing") {
			spinner.Stop()

			if quantizeSpin != nil {
				quantizeSpin.SetMessage(resp.Status)
			} else {
				quantizeSpin = progress.NewSpinner(resp.Status)
				p.Add("quantize", quantizeSpin)
			}
		} else if status != resp.Status {
			spinner.Stop()

			status = resp.Status
			spinner := progress.NewSpinner(status)
			p.Add(status, spinner)
		}

		return nil
	}

	if err := client.Create(cmd.Context(), req, fn); err != nil {
		if strings.Contains(err.Error(), "path or Modelfile are required") {
			return fmt.Errorf("the ollama server must be updated to use `ollama create` with this client")
		}
		return err
	}

	return nil
}

func createRequestFileNames(files map[string]string) map[string]string {
	names := make(map[string]string, len(files))
	root, ok := commonFileRoot(files)
	for f := range files {
		name := filepath.Base(f)
		if ok {
			abs, err := filepath.Abs(f)
			if err == nil {
				if rel, err := filepath.Rel(root, abs); err == nil && rel != "." && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
					name = rel
				}
			}
		}
		names[f] = path.Clean(filepath.ToSlash(name))
	}
	return names
}

func commonFileRoot(files map[string]string) (string, bool) {
	if len(files) < 2 {
		return "", false
	}

	var root string
	var volume string
	for f := range files {
		abs, err := filepath.Abs(f)
		if err != nil {
			return "", false
		}
		if nextVolume := filepath.VolumeName(abs); volume == "" {
			volume = nextVolume
		} else if !strings.EqualFold(volume, nextVolume) {
			return "", false
		}

		dir := filepath.Dir(abs)
		if root == "" {
			root = dir
			continue
		}

		for {
			rel, err := filepath.Rel(root, dir)
			if err == nil && (rel == "." || (rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)))) {
				break
			}

			parent := filepath.Dir(root)
			if parent == root {
				return "", false
			}
			root = parent
		}
	}

	return root, root != ""
}

func createBlob(cmd *cobra.Command, client *api.Client, path string, digest string, p *progress.Progress) (string, error) {
	realPath, err := filepath.EvalSymlinks(path)
	if err != nil {
		return err
	}

	bin, err := os.Open(realPath)
	if err != nil {
		return "", err
	}
	defer bin.Close()

	// Get file info to retrieve the size
	fileInfo, err := bin.Stat()
	if err != nil {
		return "", err
	}
	fileSize := fileInfo.Size()

	var pw progressWriter
	status := fmt.Sprintf("copying file %s 0%%", digest)
	spinner := progress.NewSpinner(status)
	p.Add(status, spinner)
	defer spinner.Stop()

	done := make(chan struct{})
	defer close(done)

	go func() {
		ticker := time.NewTicker(60 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				spinner.SetMessage(fmt.Sprintf("copying file %s %d%%", digest, int(100*pw.n.Load()/fileSize)))
			case <-done:
				spinner.SetMessage(fmt.Sprintf("copying file %s 100%%", digest))
				return
			}
		}
	}()

	if err := client.CreateBlob(cmd.Context(), digest, io.TeeReader(bin, &pw)); err != nil {
		return "", err
	}

	return digest, nil
}

type progressWriter struct {
	n atomic.Int64
}

func (w *progressWriter) Write(p []byte) (n int, err error) {
	w.n.Add(int64(len(p)))
	return len(p), nil
}

func loadOrUnloadModel(cmd *cobra.Command, opts *runOptions) error {
	p := progress.NewProgress(os.Stderr)
	defer p.StopAndClear()

	spinner := progress.NewSpinner("")
	p.Add("", spinner)

	client, err := api.ClientFromEnvironment()
	if err != nil {
		return err
	}

	requestedCloud := modelref.HasExplicitCloudSource(opts.Model)

	if info, err := client.Show(cmd.Context(), &api.ShowRequest{Model: opts.Model}); err != nil {
		return err
	} else if info.RemoteHost != "" || requestedCloud {
		// Cloud model, no need to load/unload

		isCloud := requestedCloud || strings.HasPrefix(info.RemoteHost, "https://ollama.com")

		// Check if user is signed in for ollama.com cloud models
		if isCloud {
			if _, err := client.Whoami(cmd.Context()); err != nil {
				return err
			}
		}

		if opts.ShowConnect && !isCloud {
			p.StopAndClear()
			remoteModel := info.RemoteModel
			if remoteModel == "" {
				remoteModel = opts.Model
			}
			fmt.Fprintf(os.Stderr, "Connecting to '%s' on '%s'\n", remoteModel, info.RemoteHost)
		}

		return nil
	}

	return preloadLocalModel(cmd.Context(), client, *opts)
}

func preloadLocalModel(ctx context.Context, client *api.Client, opts runOptions) error {
	if client == nil {
		return errors.New("client is required")
	}
	req := &api.GenerateRequest{
		Model:     opts.Model,
		KeepAlive: opts.KeepAlive,

		// Pass Think here so unsupported thinking modes fail before the first chat request.
		Think: opts.Think,
	}
	return client.Generate(ctx, req, func(api.GenerateResponse) error { return nil })
}

func StopHandler(cmd *cobra.Command, args []string) error {
	opts := &runOptions{
		Model:     args[0],
		KeepAlive: &api.Duration{Duration: 0},
	}
	if err := loadOrUnloadModel(cmd, opts); err != nil {
		if strings.Contains(err.Error(), "not found") {
			return fmt.Errorf("couldn't find model \"%s\" to stop", args[0])
		}
		return err
	}
	return nil
}

func generateEmbedding(cmd *cobra.Command, modelName, input string, keepAlive *api.Duration, truncate *bool, dimensions int) error {
	client, err := api.ClientFromEnvironment()
	if err != nil {
		return err
	}

	req := &api.EmbedRequest{
		Model: modelName,
		Input: input,
	}
	if keepAlive != nil {
		req.KeepAlive = keepAlive
	}
	if truncate != nil {
		req.Truncate = truncate
	}
	if dimensions > 0 {
		req.Dimensions = dimensions
	}

	resp, err := client.Embed(cmd.Context(), req)
	if err != nil {
		return err
	}

	if len(resp.Embeddings) == 0 {
		return errors.New("no embeddings returned")
	}

	output, err := json.Marshal(resp.Embeddings[0])
	if err != nil {
		return err
	}
	fmt.Println(string(output))

	return nil
}

// TODO(parthsareen): consolidate with TUI signin flow
func handleCloudAuthorizationError(err error) bool {
	var authErr api.AuthorizationError
	if errors.As(err, &authErr) && authErr.StatusCode == http.StatusUnauthorized {
		fmt.Printf("You need to be signed in to Ollama to run Cloud models.\n\n")
		if authErr.SigninURL != "" {
			fmt.Printf(ConnectInstructions, authErr.SigninURL)
		}
		return true
	}

	return false
}

// TEMP(drifkin): To match legacy `ollama run some-model:cloud` behavior, we
// best-effort pull cloud stub files for any explicit cloud source models.
// Remove this once `/api/tags` is cloud-aware.
func ensureCloudStub(ctx context.Context, client *api.Client, modelName string) {
	if !modelref.HasExplicitCloudSource(modelName) {
		return
	}

	normalizedName, _, err := modelref.NormalizePullName(modelName)
	if err != nil {
		slog.Warn("failed to normalize pull name", "model", modelName, "error", err, "normalizedName", normalizedName)
		return
	}

	listResp, err := client.List(ctx)
	if err != nil {
		slog.Warn("failed to list models", "error", err)
		return
	}

	if hasListedModelName(listResp.Models, modelName) || hasListedModelName(listResp.Models, normalizedName) {
		return
	}

	logutil.Trace("pulling cloud stub", "model", modelName, "normalizedName", normalizedName)
	err = client.Pull(ctx, &api.PullRequest{
		Model: normalizedName,
	}, func(api.ProgressResponse) error {
		return nil
	})
	if err != nil {
		slog.Warn("failed to pull cloud stub", "model", modelName, "error", err)
	}
}

func hasListedModelName(models []api.ListModelResponse, name string) bool {
	for _, m := range models {
		if strings.EqualFold(m.Name, name) || strings.EqualFold(m.Model, name) {
			return true
		}
	}
	return false
}

// showOrPullModel returns model info for name, pulling the model if it isn't
// available locally. If the pull finds no default tag but a ":cloud" tag
// exists, the user may be offered the cloud model instead (see
// pullWithCloudSuggestion), in which case the returned name is the cloud
// name the caller should continue with. verb is the user-facing command
// ("run" or "pull") used in hint text.
func showOrPullModel(cmd *cobra.Command, client *api.Client, name string, insecure bool, verb string) (*api.ShowResponse, string, error) {
	info, err := client.Show(cmd.Context(), &api.ShowRequest{Model: name})
	if err == nil {
		return info, name, nil
	}

	var se api.StatusError
	if !errors.As(err, &se) || se.StatusCode != http.StatusNotFound || modelref.HasExplicitCloudSource(name) {
		return nil, name, err
	}

	resolved, err := pullWithCloudSuggestion(cmd.Context(), client, name, insecure, cloudSuggestionRetryCommand(verb))
	if err != nil {
		return nil, name, err
	}

	info, err = client.Show(cmd.Context(), &api.ShowRequest{Model: resolved})
	return info, resolved, err
}

func RunHandler(cmd *cobra.Command, args []string) error {
	interactive := true

	opts := runOptions{
		Options:     map[string]any{},
		ShowConnect: true,
	}

	thinkExplicit, err := applyRunFlagsToOptions(cmd, &opts)
	if err != nil {
		return err
	}
	if len(args) == 0 {
		if !opts.Resume {
			return errors.New("model is required")
		}
	} else {
		opts.Model = args[0]
	}

	var prompts []string
	if len(args) > 1 {
		prompts = args[1:]
	}
	// prepend stdin to the prompt if provided
	if !term.IsTerminal(int(os.Stdin.Fd())) {
		in, err := io.ReadAll(os.Stdin)
		if err != nil {
			return err
		}

		// Only prepend stdin content if it's not empty
		stdinContent := string(in)
		if len(stdinContent) > 0 {
			prompts = append([]string{stdinContent}, prompts...)
		}
		opts.ShowConnect = false
		interactive = false
	}
	opts.Prompt = strings.Join(prompts, " ")
	if len(prompts) > 0 {
		interactive = false
	}
	// Be quiet if we're redirecting to a pipe or file
	if !term.IsTerminal(int(os.Stdout.Fd())) {
		interactive = false
	}
	if opts.Resume && opts.Model == "" {
		modelName, err := resumeModelFromLatestChat(cmd.Context())
		if err != nil {
			return err
		}
		opts.Model = modelName
	}

	// Fill out the rest of the options based on information about the
	// model.
	client, err := api.ClientFromEnvironment()
	if err != nil {
		return err
	}

	insecure, err := cmd.Flags().GetBool("insecure")
	if err != nil {
		return err
	}

	info, name, err := showOrPullModel(cmd, client, args[0], insecure, "run")
	if err != nil {
		if handleCloudAuthorizationError(err) {
			return nil
		}
		return err
	}
	// The model may have been resolved to a different name (e.g. its ":cloud"
	// variant), so make sure downstream requests use it.
	opts.Model = name

	ensureCloudStub(cmd.Context(), client, name)

	opts.Think, err = inferThinkingOption(&info.Capabilities, &opts, thinkExplicit)
	if err != nil {
		return err
	}

	applyMultiModalCompat(&opts, info)

	applyShowResponseToRunOptions(&opts, info)

	// Check if this is an embedding model
	isEmbeddingModel := slices.Contains(info.Capabilities, model.CapabilityEmbedding)

	// If it's an embedding model, handle embedding generation
	if isEmbeddingModel {
		if opts.Prompt == "" {
			return errors.New("embedding models require input text. Usage: ollama run " + name + " \"your text here\"")
		}

		// Get embedding-specific flags
		var truncate *bool
		if truncateFlag, err := cmd.Flags().GetBool("truncate"); err == nil && cmd.Flags().Changed("truncate") {
			truncate = &truncateFlag
		}

		dimensions, err := cmd.Flags().GetInt("dimensions")
		if err != nil {
			return err
		}

		return generateEmbedding(cmd, name, opts.Prompt, opts.KeepAlive, truncate, dimensions)
	}

	if slices.Contains(info.Capabilities, model.CapabilityImage) {
		return errors.New("image generation models are not currently supported")
	}

	if interactive {
		if info.RemoteHost != "" || requestedCloud {
			if err := loadOrUnloadModel(cmd, &opts); err != nil {
				var sErr api.AuthorizationError
				if errors.As(err, &sErr) && sErr.StatusCode == http.StatusUnauthorized {
					fmt.Printf("You need to be signed in to Ollama to run Cloud models.\n\n")

					if sErr.SigninURL != "" {
						fmt.Printf(ConnectInstructions, sErr.SigninURL)
					}
					return nil
				}
				return err
			}
		}

		contextWindowTokens := contextWindowTokensForRun(cmd.Context(), client, opts.Model, opts.ContextWindowTokens)

		agentOpts := agentOptionsFromRunOptions(opts)
		agentOpts.ContextWindowTokens = contextWindowTokens
		if err := config.SetLastModel(opts.Model); err != nil {
			return err
		}
		return GenerateAgentTUI(cmd, agentOpts)
	}

	if info.RemoteHost == "" && !requestedCloud {
		if err := loadOrUnloadModel(cmd, &opts); err != nil {
			var sErr api.AuthorizationError
			if errors.As(err, &sErr) && sErr.StatusCode == http.StatusUnauthorized {
				fmt.Printf("You need to be signed in to Ollama to run Cloud models.\n\n")

				if sErr.SigninURL != "" {
					fmt.Printf(ConnectInstructions, sErr.SigninURL)
				}
				return nil
			}
			return err
		}

		for _, msg := range info.Messages {
			switch msg.Role {
			case "user":
				fmt.Printf(">>> %s\n", msg.Content)
			case "assistant":
				state := &displayResponseState{}
				displayResponse(msg.Content, opts.WordWrap, state)
				fmt.Println()
				fmt.Println()
			}
		}

		speech, err := cmd.Flags().GetBool("speech")
		if err != nil {
			return err
		}

		if speech {
			return generateInteractiveAudio(cmd, opts)
		}
		return generateInteractive(cmd, opts)
	}
	opts.ContextWindowTokens = contextWindowTokensForRun(cmd.Context(), client, opts.Model, opts.ContextWindowTokens)

	return runAgentHeadless(cmd, opts)
}

func autoApproveToolsFromFlags(cmd *cobra.Command) (bool, error) {
	for _, name := range []string{"auto-approve-tools", "yolo", "experimental-yolo"} {
		if cmd.Flags().Lookup(name) == nil {
			continue
		}
		enabled, err := cmd.Flags().GetBool(name)
		if err != nil {
			return false, err
		}
		if enabled {
			return true, nil
		}
	}
	return false, nil
}

func applyRunFlagsToOptions(cmd *cobra.Command, opts *runOptions) (bool, error) {
	if cmd == nil || opts == nil {
		return false, nil
	}
	if cmd.Flags().Lookup("format") != nil {
		format, err := cmd.Flags().GetString("format")
		if err != nil {
			return false, err
		}
		opts.Format = format
	}

	thinkExplicit := false
	if thinkFlag := cmd.Flags().Lookup("think"); thinkFlag != nil && thinkFlag.Changed {
		thinkStr, err := cmd.Flags().GetString("think")
		if err != nil {
			return false, err
		}
		thinkExplicit = true

		switch thinkStr {
		case "", "true":
			opts.Think = &api.ThinkValue{Value: true}
		case "false":
			opts.Think = &api.ThinkValue{Value: false}
		case "high", "medium", "low", "max":
			opts.Think = &api.ThinkValue{Value: thinkStr}
		default:
			return false, fmt.Errorf("invalid value for --think: %q (must be true, false, high, medium, low, or max)", thinkStr)
		}
	} else {
		opts.Think = nil
	}

	if cmd.Flags().Lookup("resume") != nil {
		resume, err := cmd.Flags().GetBool("resume")
		if err != nil {
			return false, err
		}
		opts.Resume = resume
	}
	autoApproveTools, err := autoApproveToolsFromFlags(cmd)
	if err != nil {
		return false, err
	}
	opts.AutoApproveTools = autoApproveTools
	if cmd.Flags().Lookup("verbose") != nil {
		verbose, err := cmd.Flags().GetBool("verbose")
		if err != nil {
			return false, err
		}
		opts.Verbose = verbose
	}
	if cmd.Flags().Lookup("keepalive") != nil {
		keepAlive, err := cmd.Flags().GetString("keepalive")
		if err != nil {
			return false, err
		}
		if keepAlive != "" {
			d, err := time.ParseDuration(keepAlive)
			if err != nil {
				return false, err
			}
			opts.KeepAlive = &api.Duration{Duration: d}
		}
	}
	return thinkExplicit, nil
}

func runAgentHeadless(cmd *cobra.Command, opts runOptions) error {
	if err := GenerateAgentHeadless(cmd, agentOptionsFromRunOptions(opts)); err != nil {
		if handleCloudAuthorizationError(err) {
			return nil
		}
		return err
	}
	return nil
}

func resumeModelFromLatestChat(ctx context.Context) (string, error) {
	store, err := agentstore.New("")
	if err != nil {
		return "", fmt.Errorf("chat resume unavailable: %w", err)
	}
	defer store.Close()

	chat, err := store.LatestChat(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", errors.New("no saved chat to resume; pass a model to start a new chat")
		}
		return "", fmt.Errorf("could not resume chat: %w", err)
	}
	if strings.TrimSpace(chat.Model) == "" {
		return "", errors.New("latest saved chat has no model; pass a model to start a new chat")
	}
	return chat.Model, nil
}

func SigninHandler(cmd *cobra.Command, args []string) error {
	client, err := api.ClientFromEnvironment()
	if err != nil {
		return err
	}

	user, err := client.Whoami(cmd.Context())
	if err != nil {
		var aErr api.AuthorizationError
		if errors.As(err, &aErr) && aErr.StatusCode == http.StatusUnauthorized {
			fmt.Println("You need to be signed in to Ollama to run Cloud models.")
			fmt.Println()

			if aErr.SigninURL != "" {
				_ = browser.OpenURL(aErr.SigninURL)
				fmt.Printf(ConnectInstructions, aErr.SigninURL)
			}
			return nil
		}
		return err
	}

	if user != nil && user.Name != "" {
		fmt.Printf("You are already signed in as user '%s'\n", user.Name)
		fmt.Println()
		return nil
	}

	return nil
}

func SignoutHandler(cmd *cobra.Command, args []string) error {
	client, err := api.ClientFromEnvironment()
	if err != nil {
		return err
	}

	err = client.Signout(cmd.Context())
	if err != nil {
		var aErr api.AuthorizationError
		if errors.As(err, &aErr) && aErr.StatusCode == http.StatusUnauthorized {
			fmt.Println("You are not signed in to ollama.com")
			fmt.Println()
			return nil
		} else {
			return err
		}
	}

	fmt.Println("You have signed out of ollama.com")
	fmt.Println()
	return nil
}

func UsageHandler(cmd *cobra.Command, args []string) error {
	out := cmd.OutOrStdout()

	client, err := api.ClientFromEnvironment()
	if err != nil {
		return err
	}

	usage, err := client.Usage(cmd.Context())
	if err != nil {
		var aErr api.AuthorizationError
		if errors.As(err, &aErr) && aErr.StatusCode == http.StatusUnauthorized {
			fmt.Fprintln(out, "You need to be signed in to Ollama to view usage.")
			fmt.Fprintln(out)
			if aErr.SigninURL != "" {
				_ = browser.OpenURL(aErr.SigninURL)
				fmt.Fprintf(out, ConnectInstructions, aErr.SigninURL)
			}
			return nil
		}

		return err
	}

	fmt.Fprintln(out, "Usage")
	details := tabwriter.NewWriter(out, 0, 4, 2, ' ', 0)
	fmt.Fprintf(details, "  Period\t%s to %s\n", usage.Activity.Period.StartingAt.Format("2006-01-02"), usage.Activity.Period.EndingAt.Format("2006-01-02"))
	fmt.Fprintf(details, "  Spend\t$%s\n", usage.Activity.Cost)
	if err := details.Flush(); err != nil {
		return err
	}

	if len(usage.Activity.Models) == 0 && usageLimitEmpty(usage.Limits.Session) && usageLimitEmpty(usage.Limits.Weekly) {
		fmt.Fprintln(out)
		fmt.Fprintln(out, "No usage recorded for this period.")
		return nil
	}

	if len(usage.Activity.Models) > 0 {
		fmt.Fprintln(out)
		fmt.Fprintln(out, "Activity")
		table := tabwriter.NewWriter(out, 0, 4, 2, ' ', 0)
		fmt.Fprintln(table, "  Model\tRequests\tSpend")
		for _, m := range usage.Activity.Models {
			fmt.Fprintf(table, "  %s\t%d\t$%s\n", usageModelName(m.Name), m.RequestCount, m.Cost)
		}
		if err := table.Flush(); err != nil {
			return err
		}
	}

	if err := writeUsageLimit(out, "Session", usage.Limits.Session); err != nil {
		return err
	}
	if err := writeUsageLimit(out, "Weekly", usage.Limits.Weekly); err != nil {
		return err
	}

	return nil
}

func usageLimitEmpty(limit api.UsageLimit) bool {
	return limit.Usage == 0 && len(limit.Models) == 0
}

func usageModelName(name string) string {
	switch name {
	case "web search":
		return "Web Search"
	case "web fetch":
		return "Web Fetch"
	default:
		return name
	}
}

func writeUsageLimit(out io.Writer, name string, limit api.UsageLimit) error {
	if usageLimitEmpty(limit) {
		return nil
	}

	fmt.Fprintln(out)
	fmt.Fprintln(out, name)
	table := tabwriter.NewWriter(out, 0, 4, 2, ' ', 0)
	fmt.Fprintf(table, "  Used\t%.1f%%\n", limit.Usage*100)
	if len(limit.Models) > 0 {
		fmt.Fprintln(table, "  Model\tRequests")
	}
	for _, m := range limit.Models {
		fmt.Fprintf(table, "  %s\t%d\n", usageModelName(m.Name), m.RequestCount)
	}
	return table.Flush()
}

func generateFingerprint(key string) string {
	hash := sha256.Sum256([]byte(key))
	fingerprint := base64.RawURLEncoding.EncodeToString(hash[:6])

	var formatted strings.Builder
	for i, char := range fingerprint {
		if i > 0 && i%2 == 0 {
			formatted.WriteRune('-')
		}
		formatted.WriteRune(char)
	}

	return formatted.String()
}

// tryConnect handles key validation when a connection fails due to an unknown key.
// It attempts to open the browser for interactive sessions to let users connect their key,
// falling back to command-line instructions for non-interactive sessions.
// Returns nil if browser flow succeeds, or an error with connection instructions otherwise.
func tryConnect(unknownKeyErr error) error {
	// find SSH public key in the error message
	// TODO (brucemacd): the API should return structured errors so that this message parsing isn't needed
	sshKeyPattern := `ssh-\w+ [^\s"]+`
	re := regexp.MustCompile(sshKeyPattern)
	matches := re.FindStringSubmatch(unknownKeyErr.Error())

	if len(matches) > 0 {
		serverPubKey := matches[0]

		publicKey, err := auth.GetPublicKey()
		if err != nil {
			return unknownKeyErr
		}

		localPubKey := strings.TrimSpace(string(ssh.MarshalAuthorizedKey(publicKey)))

		if runtime.GOOS == "linux" && serverPubKey != localPubKey {
			// try the ollama service public key
			svcPubKey, err := os.ReadFile("/usr/share/ollama/.ollama/id_ed25519.pub")
			if err != nil {
				return unknownKeyErr
			}
			localPubKey = strings.TrimSpace(string(svcPubKey))
		}

		// check if the returned public key matches the local public key, this prevents adding a remote key to the user's account
		if serverPubKey != localPubKey {
			return unknownKeyErr
		}

		if term.IsTerminal(int(os.Stdout.Fd())) {
			// URL encode the key and device name for the browser URL
			encodedKey := base64.RawURLEncoding.EncodeToString([]byte(localPubKey))
			d, _ := os.Hostname()
			encodedDevice := url.QueryEscape(d)
			browserURL := fmt.Sprintf("https://ollama.com/connect?host=%s&key=%s", encodedDevice, encodedKey)

			if err := browser.OpenURL(browserURL); err == nil {
				fmt.Printf("\nOpening browser to add your key...\n")
				fmt.Printf("\nCheck that this code matches what is shown in your browser:\n")
				fmt.Printf("\n    %s\n", generateFingerprint(localPubKey))
				return nil
			}
		}

		// only return error for non-interactive terminals or if browser opening failed
		return fmt.Errorf("%s\nAdd your key at:\nhttps://ollama.com/settings/keys", unknownKeyErr.Error())
	}

	return unknownKeyErr
}

// unknownKey handles key validation when a connection fails due to an unknown key.
// It attempts to open the browser for interactive sessions to let users connect their key,
// falling back to command-line instructions for non-interactive sessions.
// Returns nil if browser flow succeeds, or an error with connection instructions otherwise.
func unknownKey(unknownKeyErr error) error {
	// find SSH public key in the error message
	// TODO (brucemacd): the API should return structured errors so that this message parsing isn't needed
	sshKeyPattern := `ssh-\w+ [^\s"]+`
	re := regexp.MustCompile(sshKeyPattern)
	matches := re.FindStringSubmatch(unknownKeyErr.Error())

	if len(matches) > 0 {
		serverPubKey := matches[0]

		localPubKey, err := auth.GetPublicKey()
		if err != nil {
			return unknownKeyErr
		}

		if runtime.GOOS == "linux" && serverPubKey != localPubKey {
			// try the ollama service public key
			svcPubKey, err := os.ReadFile("/usr/share/ollama/.ollama/id_ed25519.pub")
			if err != nil {
				return unknownKeyErr
			}
			localPubKey = strings.TrimSpace(string(svcPubKey))
		}

		// check if the returned public key matches the local public key, this prevents adding a remote key to the user's account
		if serverPubKey != localPubKey {
			return unknownKeyErr
		}

		if term.IsTerminal(int(os.Stdout.Fd())) && !envconfig.Noninteractive() {
			// URL encode the key and device name for the browser URL
			encodedKey := base64.RawURLEncoding.EncodeToString([]byte(localPubKey))
			d, _ := os.Hostname()
			encodedDevice := url.QueryEscape(d)
			browserURL := fmt.Sprintf("https://ollama.com/connect?host=%s&key=%s", encodedDevice, encodedKey)
			if err := browser.OpenURL(browserURL); err == nil {
				fmt.Println("Opening browser to connect your device...")
				return nil
			}
		}

		var msg strings.Builder
		msg.WriteString(unknownKeyErr.Error())
		msg.WriteString("\n\nYour ollama key is:\n")
		msg.WriteString(localPubKey)
		msg.WriteString("\nAdd your key at:\n")
		msg.WriteString("https://ollama.com/settings/keys")

		return errors.New(msg.String())
	}

	return unknownKeyErr
}

func PushHandler(cmd *cobra.Command, args []string) error {
	client, err := api.ClientFromEnvironment()
	if err != nil {
		return err
	}

	insecure, err := cmd.Flags().GetBool("insecure")
	if err != nil {
		return err
	}

	n := model.ParseName(args[0])
	if strings.HasSuffix(n.Host, ".ollama.ai") || strings.HasSuffix(n.Host, ".ollama.com") {
		_, err := client.Whoami(cmd.Context())
		if err != nil {
			var aErr api.AuthorizationError
			if errors.As(err, &aErr) && aErr.StatusCode == http.StatusUnauthorized {
				fmt.Println("You need to be signed in to push models to ollama.com.")
				fmt.Println()

				if aErr.SigninURL != "" {
					fmt.Printf(ConnectInstructions, aErr.SigninURL)
				}
				return nil
			}

			return err
		}
	}

	p := progress.NewProgress(os.Stderr)
	defer p.Stop()

	bars := make(map[string]*progress.Bar)
	var status string
	var spinner *progress.Spinner

	fn := func(resp api.ProgressResponse) error {
		if resp.Digest != "" {
			if spinner != nil {
				spinner.Stop()
			}

			bar, ok := bars[resp.Digest]
			if !ok {
				msg := resp.Status
				if msg == "" {
					msg = fmt.Sprintf("pushing %s...", resp.Digest[7:19])
				}
				bar = progress.NewBar(msg, resp.Total, resp.Completed)
				bars[resp.Digest] = bar
				p.Add(resp.Digest, bar)
			}

			bar.Set(resp.Completed)
		} else if status != resp.Status {
			if spinner != nil {
				spinner.Stop()
			}

			status = resp.Status
			spinner = progress.NewSpinner(status)
			p.Add(status, spinner)
		}

		return nil
	}

	request := api.PushRequest{Name: args[0], Insecure: insecure}

	if err := client.Push(cmd.Context(), &request, fn); err != nil {
		if spinner != nil {
			spinner.Stop()
		}
		errStr := strings.ToLower(err.Error())
		if strings.Contains(errStr, "access denied") || strings.Contains(errStr, "unauthorized") {
			return errors.New("you are not authorized to push to this namespace, create the model under a namespace you own")
		}
		if strings.Contains(err.Error(), errtypes.UnknownOllamaKeyErrMsg) && isOllamaHost {
			// the user has not added their ollama key to ollama.com
			// return an error with a more user-friendly message
			return tryConnect(err)
		}
		return err
	}

	p.Stop()
	spinner.Stop()

	destination := n.String()
	if isOllamaHost {
		destination = "https://ollama.com/" + strings.TrimSuffix(n.DisplayShortest(), ":latest")
	}
	fmt.Printf("\nYou can find your model at:\n\n")
	fmt.Printf("\t%s\n", destination)

	return nil
}

func ListRunningHandler(cmd *cobra.Command, args []string) error {
	client, err := api.ClientFromEnvironment()
	if err != nil {
		return err
	}

	models, err := client.ListRunning(cmd.Context())
	if err != nil {
		return err
	}

	var data [][]string

	for _, m := range models.Models {
		if len(args) == 0 || strings.HasPrefix(m.Model, args[0]) {
			var procStr string
			switch {
			case m.SizeVRAM == 0:
				procStr = "100% CPU"
			case m.SizeVRAM == m.Size:
				procStr = "100% GPU"
			case m.SizeVRAM > m.Size || m.Size == 0:
				procStr = "Unknown"
			default:
				sizeCPU := m.Size - m.SizeVRAM
				cpuPercent := math.Round(float64(sizeCPU) / float64(m.Size) * 100)
				procStr = fmt.Sprintf("%d%%/%d%% CPU/GPU", int(cpuPercent), int(100-cpuPercent))
			}

			var until string
			delta := time.Since(m.ExpiresAt)
			if delta > 0 {
				until = "Stopping..."
			} else {
				until = format.HumanTime(m.ExpiresAt, "Never")
			}
			ctxStr := strconv.Itoa(m.ContextLength)
			data = append(data, []string{m.Name, m.Digest[:12], format.HumanBytes(m.Size), procStr, ctxStr, until})
		}
	}

	table := tablewriter.NewWriter(os.Stdout)
	table.SetHeader([]string{"NAME", "ID", "SIZE", "PROCESSOR", "CONTEXT", "UNTIL"})
	table.SetHeaderAlignment(tablewriter.ALIGN_LEFT)
	table.SetAlignment(tablewriter.ALIGN_LEFT)
	table.SetHeaderLine(false)
	table.SetBorder(false)
	table.SetNoWhiteSpace(true)
	table.SetTablePadding("    ")
	table.AppendBulk(data)
	table.Render()

	return nil
}

func DeleteHandler(cmd *cobra.Command, args []string) error {
	client, err := api.ClientFromEnvironment()
	if err != nil {
		return err
	}

	for _, arg := range args {
		// Unload the model if it's running before deletion
		if err := loadOrUnloadModel(cmd, &runOptions{
			Model:     arg,
			KeepAlive: &api.Duration{Duration: 0},
		}); err != nil {
			if !strings.Contains(strings.ToLower(err.Error()), "not found") {
				fmt.Fprintf(os.Stderr, "Warning: unable to stop model '%s'\n", arg)
			}
		}

		if err := client.Delete(cmd.Context(), &api.DeleteRequest{Name: arg}); err != nil {
			return err
		}
		fmt.Printf("deleted '%s'\n", arg)
	}
	return nil
}

func ShowHandler(cmd *cobra.Command, args []string) error {
	client, err := api.ClientFromEnvironment()
	if err != nil {
		return err
	}

	license, errLicense := cmd.Flags().GetBool("license")
	modelfile, errModelfile := cmd.Flags().GetBool("modelfile")
	parameters, errParams := cmd.Flags().GetBool("parameters")
	system, errSystem := cmd.Flags().GetBool("system")
	template, errTemplate := cmd.Flags().GetBool("template")
	verbose, errVerbose := cmd.Flags().GetBool("verbose")

	for _, boolErr := range []error{errLicense, errModelfile, errParams, errSystem, errTemplate, errVerbose} {
		if boolErr != nil {
			return errors.New("error retrieving flags")
		}
	}

	flagsSet := 0
	showType := ""

	if model {
		flagsSet++
		showType = "model"
	}

	if license {
		flagsSet++
		showType = "license"
	}

	if modelfile {
		flagsSet++
		showType = "modelfile"
	}

	if parameters {
		flagsSet++
		showType = "parameters"
	}

	if system {
		flagsSet++
		showType = "system"
	}

	if template {
		flagsSet++
		showType = "template"
	}

	if flagsSet > 1 {
		return errors.New("only one of '--license', '--modelfile', '--parameters', '--system', or '--template' can be specified")
	}

	req := api.ShowRequest{Name: args[0], Verbose: verbose}
	resp, err := client.Show(cmd.Context(), &req)
	if err != nil {
		return err
	}

	if slices.Contains(resp.Capabilities, model.CapabilityImage) {
		return errors.New("image generation models are not currently supported")
	}

	if flagsSet == 1 {
		switch showType {
		case "license":
			fmt.Println(resp.License)
		case "modelfile":
			fmt.Println(resp.Modelfile)
		case "parameters":
			fmt.Println(formatParams(resp.Parameters, false))
		case "system":
			fmt.Print(resp.System)
		case "template":
			fmt.Print(resp.Template)
		}

		return nil
	}

	return showInfo(resp, verbose, os.Stdout)
}

func showInfo(resp *api.ShowResponse, verbose bool, w io.Writer) error {
	tableRender := func(header string, rows func() [][]string) {
		fmt.Fprintln(w, " ", header)
		table := tablewriter.NewWriter(w)
		table.SetAlignment(tablewriter.ALIGN_LEFT)
		table.SetBorder(false)
		table.SetNoWhiteSpace(true)
		table.SetTablePadding("    ")

		switch header {
		case "Template", "System", "License":
			table.SetColWidth(100)
		}

		table.AppendBulk(rows())
		table.Render()
		fmt.Fprintln(w)
	}

	tableRender("Model", func() (rows [][]string) {
		if resp.RemoteHost != "" {
			rows = append(rows, []string{"", "Remote model", resp.RemoteModel})
			rows = append(rows, []string{"", "Remote URL", resp.RemoteHost})
		}

		if resp.ModelInfo != nil {
			arch, _ := resp.ModelInfo["general.architecture"].(string)
			if arch != "" {
				rows = append(rows, []string{"", "architecture", arch})
			}

			var paramStr string
			if resp.Details.ParameterSize != "" {
				paramStr = resp.Details.ParameterSize
			} else if v, ok := resp.ModelInfo["general.parameter_count"]; ok {
				if f, ok := v.(float64); ok {
					paramStr = format.HumanNumber(uint64(f))
				}
			}
			if paramStr != "" {
				rows = append(rows, []string{"", "parameters", paramStr})
			}

			if v, ok := resp.ModelInfo[fmt.Sprintf("%s.context_length", arch)]; ok {
				if f, ok := v.(float64); ok {
					rows = append(rows, []string{"", "context length", strconv.FormatFloat(f, 'f', -1, 64)})
				}
			}

			if v, ok := resp.ModelInfo[fmt.Sprintf("%s.embedding_length", arch)]; ok {
				if f, ok := v.(float64); ok {
					rows = append(rows, []string{"", "embedding length", strconv.FormatFloat(f, 'f', -1, 64)})
				}
			}
		} else {
			rows = append(rows, []string{"", "architecture", resp.Details.Family})
			rows = append(rows, []string{"", "parameters", resp.Details.ParameterSize})
		}
		rows = append(rows, []string{"", "quantization", resp.Details.QuantizationLevel})
		if resp.Requires != "" {
			rows = append(rows, []string{"", "requires", resp.Requires})
		}
		return
	})

	if len(resp.Capabilities) > 0 {
		tableRender("Capabilities", func() (rows [][]string) {
			for _, capability := range resp.Capabilities {
				rows = append(rows, []string{"", capability.String()})
			}
			return
		})
	}

	if resp.ProjectorInfo != nil {
		tableRender("Projector", func() (rows [][]string) {
			arch, _ := resp.ProjectorInfo["general.architecture"].(string)
			if arch != "" {
				rows = append(rows, []string{"", "architecture", arch})
			}
			if v, ok := resp.ProjectorInfo["general.parameter_count"].(float64); ok {
				rows = append(rows, []string{"", "parameters", format.HumanNumber(uint64(v))})
			}

			projectorValue := func(suffix string) (float64, bool) {
				for _, modality := range []string{"vision", "audio"} {
					if v, ok := resp.ProjectorInfo[fmt.Sprintf("%s.%s.%s", arch, modality, suffix)].(float64); ok {
						return v, true
					}
				}
				return 0, false
			}
			if v, ok := projectorValue("embedding_length"); ok {
				rows = append(rows, []string{"", "embedding length", strconv.FormatFloat(v, 'f', -1, 64)})
			}
			if v, ok := projectorValue("projection_dim"); ok {
				rows = append(rows, []string{"", "dimensions", strconv.FormatFloat(v, 'f', -1, 64)})
			}
			return
		})
	}

	if resp.Parameters != "" {
		tableRender("Parameters", func() (rows [][]string) {
			scanner := bufio.NewScanner(strings.NewReader(resp.Parameters))
			for scanner.Scan() {
				if text := scanner.Text(); text != "" {
					rows = append(rows, append([]string{""}, strings.Fields(text)...))
				}
			}
			return
		})
	}

	if resp.ModelInfo != nil && verbose {
		tableRender("Metadata", func() (rows [][]string) {
			keys := make([]string, 0, len(resp.ModelInfo))
			for k := range resp.ModelInfo {
				keys = append(keys, k)
			}
			sort.Strings(keys)

			for _, k := range keys {
				var v string
				switch vData := resp.ModelInfo[k].(type) {
				case bool:
					v = fmt.Sprintf("%t", vData)
				case string:
					v = vData
				case float64:
					v = fmt.Sprintf("%g", vData)
				case []any:
					targetWidth := 10 // Small width where we are displaying the data in a column

					var itemsToShow int
					totalWidth := 1 // Start with 1 for opening bracket

					// Find how many we can fit
					for i := range vData {
						itemStr := fmt.Sprintf("%v", vData[i])
						width := runewidth.StringWidth(itemStr)

						// Add separator width (", ") for all items except the first
						if i > 0 {
							width += 2
						}

						// Check if adding this item would exceed our width limit
						if totalWidth+width > targetWidth && i > 0 {
							break
						}

						totalWidth += width
						itemsToShow++
					}

					// Format the output
					if itemsToShow < len(vData) {
						v = fmt.Sprintf("%v", vData[:itemsToShow])
						v = strings.TrimSuffix(v, "]")
						v += fmt.Sprintf(" ...+%d more]", len(vData)-itemsToShow)
					} else {
						v = fmt.Sprintf("%v", vData)
					}
				default:
					v = fmt.Sprintf("%T", vData)
				}
				rows = append(rows, []string{"", k, v})
			}
			return
		})
	}

	if len(resp.Tensors) > 0 && verbose {
		tableRender("Tensors", func() (rows [][]string) {
			for _, t := range resp.Tensors {
				rows = append(rows, []string{"", t.Name, t.Type, fmt.Sprint(t.Shape)})
			}
			return
		})
	}

	head := func(s string, n int) (rows [][]string) {
		scanner := bufio.NewScanner(strings.NewReader(s))
		count := 0
		for scanner.Scan() {
			text := strings.TrimSpace(scanner.Text())
			if text == "" {
				continue
			}
			count++
			if n < 0 || count <= n {
				rows = append(rows, []string{"", text})
			}
		}
		if n >= 0 && count > n {
			rows = append(rows, []string{"", "..."})
		}
		return
	}

	if resp.System != "" {
		tableRender("System", func() [][]string {
			return head(resp.System, 2)
		})
	}

	if resp.License != "" {
		tableRender("License", func() [][]string {
			return head(resp.License, 2)
		})
	}

	return nil
}

func truncate(s string) string {
	lines := strings.Split(s, "\n")
	var truncated strings.Builder

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" {
			truncated.WriteString(line + " ")
			if truncated.Len() > 60 {
				return truncated.String()[:57] + "..."
			}
		}
	}
	return strings.TrimSpace(truncated.String())
}

// temporary fix for buggy params #4918
func handleParams(s string) string {
	lines := strings.Split(s, "\n")
	var truncated strings.Builder

	truncated.WriteString("{")
	for _, line := range lines {
		line = strings.Join(strings.Fields(line), ":")
		truncated.WriteString(line + ",")
		if truncated.Len() > 60 {
			return truncated.String()[:57] + "..."
		}
	}
	return strings.TrimSpace(truncated.String()) + "}"
}

func CopyHandler(cmd *cobra.Command, args []string) error {
	client, err := api.ClientFromEnvironment()
	if err != nil {
		return err
	}

	req := api.CopyRequest{Source: args[0], Destination: args[1]}
	if err := client.Copy(cmd.Context(), &req); err != nil {
		return err
	}
	fmt.Printf("copied '%s' to '%s'\n", args[0], args[1])
	return nil
}

func CopyHandler(cmd *cobra.Command, args []string) error {
	client := api.NewClient()

	req := api.CopyRequest{Source: args[0], Destination: args[1]}
	if err := client.Copy(context.Background(), &req); err != nil {
		return err
	}
	fmt.Printf("copied '%s' to '%s'\n", args[0], args[1])
	return nil
}

func PullHandler(cmd *cobra.Command, args []string) error {
	upgradeAll, err := cmd.Flags().GetBool("upgrade-all")
	if err != nil {
		return err
	}

	if !upgradeAll {
		if len(args) == 0 {
			return fmt.Errorf("no model specified to pull")
		}
		return pull(cmd, args[0], "")
	}

	client, err := api.ClientFromEnvironment()
	if err != nil {
		return err
	}

	models, err := client.List(cmd.Context())
	if err != nil {
		return err
	}

	for _, m := range (*models).Models {
		err = pull(cmd, m.Name, "sha256:"+m.Digest)
		if err != nil {
			if strings.Contains(err.Error(), "file does not exist") {
				fmt.Printf("model '%s' is no longer available\n", m.Name)
				continue
			}
			return err
		}
	}
	return nil
}

func pull(cmd *cobra.Command, name string, currentDigest string) error {
	insecure, err := cmd.Flags().GetBool("insecure")
	if err != nil {
		panic(err)
	}
	return v
}

	client, err := api.ClientFromEnvironment()
	if err != nil {
		return err
	}

	_, err = pullWithCloudSuggestion(cmd.Context(), client, args[0], insecure, cloudSuggestionRetryCommand("pull"))
	return err
}

// pullModelWithProgress pulls name, rendering progress to stderr. When
// clearNotFound is set and the pull fails because the model doesn't exist,
// the progress display is erased rather than left behind; callers set it
// when a ":cloud" suggestion prompt may immediately follow the failure.
func pullModelWithProgress(ctx context.Context, client *api.Client, name string, insecure, clearNotFound bool) error {
	p := progress.NewProgress(os.Stderr)
	defer p.StopWithoutClear()

	bars := make(map[string]*progress.Bar)

	var status string
	var state progress.State
	for c := range w {
		if c.Status != status {
			if s, ok := state.(*progress.Spinner); ok {
				s.Stop()
			}

			status = c.Status
			if c.Digest != "" {
				state = progress.NewBar(status, c.Total, c.Completed)
			} else {
				state = progress.NewSpinner(status)
			}

			p.Add(status, state)
		}

		if b, ok := state.(*progress.Bar); ok {
			b.Set(c.Completed)
		}
	}

	request := api.PullRequest{Name: name, Insecure: insecure}
	err := client.Pull(ctx, &request, fn)
	if clearNotFound && isPullNotFoundErr(err) {
		// The deferred Stop becomes a no-op after this.
		p.StopAndClear()
	}
	return err
}

type runOptions struct {
	Model               string
	ParentModel         string
	LoadedMessages      []api.Message
	Prompt              string
	Messages            []api.Message
	Format              string
	System              string
	Images              []api.ImageData
	Options             map[string]any
	MultiModal          bool
	KeepAlive           *api.Duration
	Think               *api.ThinkValue
	ShowConnect         bool
	ContextWindowTokens int
	Resume              bool
	AutoApproveTools    bool
	Verbose             bool
}

func (r runOptions) Copy() runOptions {
	var loadedMessages []api.Message
	if r.LoadedMessages != nil {
		loadedMessages = make([]api.Message, len(r.LoadedMessages))
		copy(loadedMessages, r.LoadedMessages)
	}

	var messages []api.Message
	if r.Messages != nil {
		messages = make([]api.Message, len(r.Messages))
		copy(messages, r.Messages)
	}

	var images []api.ImageData
	if r.Images != nil {
		images = make([]api.ImageData, len(r.Images))
		copy(images, r.Images)
	}

	var opts map[string]any
	if r.Options != nil {
		opts = make(map[string]any, len(r.Options))
		for k, v := range r.Options {
			opts[k] = v
		}
	}

	var think *api.ThinkValue
	if r.Think != nil {
		cThink := *r.Think
		think = &cThink
	}

	return runOptions{
		Model:               r.Model,
		ParentModel:         r.ParentModel,
		LoadedMessages:      loadedMessages,
		Prompt:              r.Prompt,
		Messages:            messages,
		Format:              r.Format,
		System:              r.System,
		Images:              images,
		Options:             opts,
		MultiModal:          r.MultiModal,
		KeepAlive:           r.KeepAlive,
		Think:               think,
		ShowConnect:         r.ShowConnect,
		ContextWindowTokens: r.ContextWindowTokens,
		Resume:              r.Resume,
		AutoApproveTools:    r.AutoApproveTools,
		Verbose:             r.Verbose,
	}
}

func applyShowResponseToRunOptions(opts *runOptions, info *api.ShowResponse) {
	opts.ParentModel = info.Details.ParentModel
	opts.LoadedMessages = slices.Clone(info.Messages)
	if strings.TrimSpace(opts.System) == "" {
		opts.System = info.System
	}
	opts.ContextWindowTokens = contextWindowTokensFromShowResponse(info)
}

func applyMultiModalCompat(opts *runOptions, info *api.ShowResponse) {
	audioCapable := slices.Contains(info.Capabilities, model.CapabilityAudio)
	opts.MultiModal = slices.Contains(info.Capabilities, model.CapabilityVision) || audioCapable
	// TODO: remove the projector info and vision info checks below,
	// these are left in for backwards compatibility with older servers
	// that don't have the capabilities field in the model info
	if len(info.ProjectorInfo) != 0 {
		opts.MultiModal = true
	}
	for k := range info.ModelInfo {
		if strings.Contains(k, ".vision.") {
			opts.MultiModal = true
			break
		}
	}
}

func contextWindowTokensFromShowResponse(info *api.ShowResponse) int {
	if info == nil {
		return 0
	}
	if info.Details.ContextLength > 0 {
		return info.Details.ContextLength
	}
	if info.ModelInfo == nil {
		return 0
	}
	arch, _ := info.ModelInfo["general.architecture"].(string)
	if arch == "" {
		return 0
	}
	switch v := info.ModelInfo[fmt.Sprintf("%s.context_length", arch)].(type) {
	case int:
		return v
	case int64:
		return int(v)
	case float64:
		return int(v)
	case float32:
		return int(v)
	default:
		return 0
	}
}

func contextWindowTokensForRun(ctx context.Context, client *api.Client, modelName string, fallback int) int {
	if client == nil || strings.TrimSpace(modelName) == "" {
		return fallback
	}
	if running, err := client.ListRunning(ctx); err == nil {
		if contextLength := contextWindowTokensFromRunningModels(running.Models, modelName); contextLength > 0 {
			return contextLength
		}
	}
	if modelref.HasExplicitCloudSource(modelName) {
		if info, err := client.Show(ctx, &api.ShowRequest{Model: modelName}); err == nil {
			if contextLength := contextWindowTokensFromShowResponse(info); contextLength > 0 {
				return contextLength
			}
		}
	}
	return fallback
}

func contextWindowTokensFromRunningModels(models []api.ProcessModelResponse, modelName string) int {
	for _, running := range models {
		if running.ContextLength > 0 && runningModelMatchesName(running, modelName) {
			return running.ContextLength
		}
	}
	return 0
}

func runningModelMatchesName(running api.ProcessModelResponse, modelName string) bool {
	for _, candidate := range []string{running.Name, running.Model} {
		if modelNameMatches(candidate, modelName) {
			return true
		}
	}
	return false
}

func chat(cmd *cobra.Command, opts runOptions) (*api.Message, *api.Metrics, error) {
	client, err := api.ClientFromEnvironment()
	if err != nil {
		return nil, nil, err
	}
	if a == b {
		return true
	}
	return model.ParseName(a).DisplayShortest() == model.ParseName(b).DisplayShortest()
}

func runCommandArgs(cmd *cobra.Command, args []string) error {
	if len(args) > 0 {
		return nil
	}

	var format json.RawMessage
	if opts.Format != "" {
		format = json.RawMessage(opts.Format)
	}

	req := &api.ChatRequest{
		Model:    opts.Model,
		Template: opts.Template,
		Messages: opts.Messages,
		Format:   format,
		Options:  opts.Options,
		Think:    opts.Think,
	}

	if opts.KeepAlive != nil {
		req.KeepAlive = opts.KeepAlive
	}

	if opts.Audio {
		req.RunSpeech = true
	}

	if err := client.Chat(cancelCtx, req, fn); err != nil {
		if errors.Is(err, context.Canceled) {
			return nil, nil, nil
		}

		// this error should ideally be wrapped properly by the client
		if strings.Contains(err.Error(), "upstream error") {
			p.StopAndClear()
			fmt.Println("An error occurred while processing your message. Please try again.")
			fmt.Println()
			return nil, nil, nil
		}
		return nil, nil, err
	}

	if len(opts.Messages) > 0 {
		fmt.Println()
		fmt.Println()
	}

	verbose, err := cmd.Flags().GetBool("verbose")
	if err != nil {
		return nil, nil, err
	}

	if verbose {
		latest.Summary()
	}

	return &api.Message{Role: role, Thinking: thinkingContent.String(), Content: fullResponse.String()}, &latest.Metrics, nil
}

func embed(cmd *cobra.Command, opts runOptions) error {
	line := opts.Prompt
	client, err := api.ClientFromEnvironment()
	if err != nil {
		fmt.Println("error: couldn't connect to ollama server")
		return err
	}

	inputs := strings.Split(line, "\n\n")

	req := &api.EmbedRequest{
		Model: opts.Model,
		Input: inputs,
	}

	resp, err := client.Embed(cmd.Context(), req)
	if err != nil {
		fmt.Println("error: couldn't get embeddings")
		return err
	}

	embeddings := resp.Embeddings

	r, c := len(embeddings), len(embeddings[0])
	data := make([]float64, r*c)
	for i := range r {
		for j := range c {
			data[i*c+j] = float64(embeddings[i][j])
		}
	}

	X := mat.NewDense(r, c, data)

	// Initialize PCA
	var pca stat.PC

	// Perform PCA
	if !pca.PrincipalComponents(X, nil) {
		return fmt.Errorf("PCA failed")
	}

	// Extract principal component vectors
	var vectors mat.Dense
	pca.VectorsTo(&vectors)

	// // Extract variances of the principal components
	// var variances []float64
	// variances = pca.VarsTo(variances)

	W := vectors.Slice(0, c, 0, 2).(*mat.Dense)

	// Perform PCA reduction
	var reducedData mat.Dense
	reducedData.Mul(X, W)

	for i, s := range inputs {
		row := reducedData.RowView(i)
		fmt.Print(i+1, ". ", s, "\n")
		fmt.Printf("[%v, %v]\n\n", row.AtVec(0), row.AtVec(1))
	}

	points := make(plotter.XYs, reducedData.RawMatrix().Rows)
	for i := range len(points) {
		row := reducedData.RowView(i)
		points[i].X = row.AtVec(0)
		points[i].Y = row.AtVec(1)
	}

	// Create a new plot
	p := plot.New()

	// Set plot title and axis labels
	p.Title.Text = "Embedding Map"

	// Create a scatter plot of the points
	s, err := plotter.NewScatter(points)
	if err != nil {
		panic(err)
	}
	p.Add(s)

	/// Create labels plotter and add it to the plot

	labels := make([]string, reducedData.RawMatrix().Rows)
	for i := range len(labels) {
		labels[i] = fmt.Sprintf("%d", i+1)
	}

	// plotter := plotter

	l, err := plotter.NewLabels(plotter.XYLabels{XYs: points, Labels: labels})
	if err != nil {
		panic(err)
	}
	p.Add(l)

	// Make the grid square
	p.X.Min = -1
	p.X.Max = 1
	p.Y.Min = -1
	p.Y.Max = 1

	// Set the aspect ratio to be 1:1
	p.X.Tick.Marker = plot.ConstantTicks([]plot.Tick{
		{Value: -1, Label: "-1"},
		{Value: -0.5, Label: "-0.5"},
		{Value: 0, Label: "0"},
		{Value: 0.5, Label: "0.5"},
		{Value: 1, Label: "1"},
	})
	p.Y.Tick.Marker = plot.ConstantTicks([]plot.Tick{
		{Value: -1, Label: "-1"},
		{Value: -0.5, Label: "-0.5"},
		{Value: 0, Label: "0"},
		{Value: 0.5, Label: "0.5"},
		{Value: 1, Label: "1"},
	})

	// Save the plot to a svg file
	if err := p.Save(6*vg.Inch, 6*vg.Inch, "plot.svg"); err != nil {
		panic(err)
	}

	// open the plot
	open := exec.Command("open", "plot.svg")
	err = open.Run()
	if err != nil {
		fmt.Println("error: couldn't open plot")
		return err
	}

	// Wait for Enter key press
	fmt.Print("Press 'Enter' to continue")
	reader := bufio.NewReader(os.Stdin)
	_, _ = reader.ReadString('\n')

	// close and delete the plot (defer this)
	defer func() {
		delete := exec.Command("rm", "plot.svg")
		err = delete.Run()
		if err != nil {
			fmt.Println("error: couldn't delete plot")
		}
	}()

	return nil
}

func generate(cmd *cobra.Command, opts runOptions) error {
	client, err := api.ClientFromEnvironment()
	if err != nil {
		return err
	}

	p := progress.NewProgress(os.Stderr)
	defer p.StopAndClear()

	spinner := progress.NewSpinner("")
	p.Add("", spinner)

	var latest api.GenerateResponse

	generateContext, ok := cmd.Context().Value(generateContextKey("context")).([]int)
	if !ok {
		generateContext = []int{}
	}

	ctx, cancel := context.WithCancel(cmd.Context())
	defer cancel()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT)

	go func() {
		<-sigChan
		cancel()
	}()

	var state *displayResponseState = &displayResponseState{}
	var thinkingContent strings.Builder
	var thinkTagOpened bool = false
	var thinkTagClosed bool = false

	plainText := !term.IsTerminal(int(os.Stdout.Fd()))

	fn := func(response api.GenerateResponse) error {
		latest = response
		content := response.Response

		if response.Response != "" || !opts.HideThinking {
			p.StopAndClear()
		}

		if response.Thinking != "" && !opts.HideThinking {
			if !thinkTagOpened {
				fmt.Print(thinkingOutputOpeningText(plainText))
				thinkTagOpened = true
				thinkTagClosed = false
			}
			thinkingContent.WriteString(response.Thinking)
			displayResponse(response.Thinking, opts.WordWrap, state)
		}

		if thinkTagOpened && !thinkTagClosed && (content != "" || len(response.ToolCalls) > 0) {
			if !strings.HasSuffix(thinkingContent.String(), "\n") {
				fmt.Println()
			}
			fmt.Print(thinkingOutputClosingText(plainText))
			thinkTagOpened = false
			thinkTagClosed = true
			state = &displayResponseState{}
		}

		displayResponse(content, opts.WordWrap, state)

		if response.ToolCalls != nil {
			toolCalls := response.ToolCalls
			if len(toolCalls) > 0 {
				fmt.Print(renderToolCalls(toolCalls, plainText))
			}
		}

		return nil
	}

	if opts.MultiModal {
		opts.Prompt, opts.Images, err = extractFileData(opts.Prompt)
		if err != nil {
			return err
		}
		if resume {
			return nil
		}
	}
	return cobra.MinimumNArgs(1)(cmd, args)
}

func prepareRootResumeRunCommand(rootCmd, runCmd *cobra.Command) error {
	return prepareRootRunCommand(rootCmd, runCmd, true)
}

func prepareRootModelRunCommand(rootCmd, runCmd *cobra.Command) error {
	return prepareRootRunCommand(rootCmd, runCmd, false)
}

func prepareRootRunCommand(rootCmd, runCmd *cobra.Command, resume bool) error {
	if runCmd == nil {
		return errors.New("run command unavailable")
	}

	runCmd.SetContext(rootCmd.Context())
	if resume {
		if err := runCmd.Flags().Set("resume", "true"); err != nil {
			return err
		}
	}

	var format json.RawMessage
	if opts.Format != "" {
		format = json.RawMessage(opts.Format)
	}

	request := api.GenerateRequest{
		Model:     opts.Model,
		Prompt:    opts.Prompt,
		Context:   generateContext,
		Images:    opts.Images,
		Format:    format,
		System:    opts.System,
		Options:   opts.Options,
		KeepAlive: opts.KeepAlive,
		Think:     opts.Think,
	}

	speech, err := cmd.Flags().GetBool("speech")
	if err != nil {
		return err
	}

	// create temp wav file with the recorder package
	if speech {
		tempFile, err := os.CreateTemp("", "recording-*.wav")
		if err != nil {
			return err
		}
		defer os.Remove(tempFile.Name())

		fmt.Print("Speech Mode\n\n")

		err = recorder.RecordAudio(tempFile)
		if err != nil {
			return err
		}

		request.Speech = &api.WhisperRequest{
			Audio: tempFile.Name(),
		}
	}
	if err := client.Generate(ctx, &request, fn); err != nil {
		if errors.Is(err, context.Canceled) {
			return nil
		}
		switch rootFlag.Name {
		case "model", "resume", "version":
			return
		}
		runFlag := runCmd.Flags().Lookup(rootFlag.Name)
		if runFlag == nil {
			return
		}
		if err := runCmd.Flags().Set(rootFlag.Name, rootFlag.Value.String()); err != nil {
			setErr = err
		}
	})
	if setErr != nil {
		return setErr
	}

	return nil
}

type runFlagOptions struct {
	includeResume  bool
	includeVerbose bool
	includeFormat  bool
}

func registerRunFlags(cmd *cobra.Command, includeResume bool) {
	registerRunFlagsWithOptions(cmd, runFlagOptions{
		includeResume:  includeResume,
		includeVerbose: true,
		includeFormat:  true,
	})
}

func registerRootRunFlags(cmd *cobra.Command) {
	registerRunFlagsWithOptions(cmd, runFlagOptions{
		includeResume: true,
	})
}

func registerRunFlagsWithOptions(cmd *cobra.Command, opts runFlagOptions) {
	cmd.Flags().String("keepalive", "", "Duration to keep a model loaded (e.g. 5m)")
	if opts.includeVerbose {
		cmd.Flags().Bool("verbose", false, "Show timings for response")
	}
	cmd.Flags().Bool("insecure", false, "Use an insecure registry")
	if opts.includeFormat {
		cmd.Flags().String("format", "", "Response format (e.g. json)")
	}
	cmd.Flags().String("think", "", "Enable thinking mode: true/false or high/medium/low for supported models")
	cmd.Flags().Lookup("think").NoOptDefVal = "true"
	if opts.includeResume {
		cmd.Flags().Bool("resume", false, "Resume the latest persisted chat")
	}
	cmd.Flags().Bool("auto-approve-tools", false, "Allow agent tools to run without prompting")
	cmd.Flags().Bool("yolo", false, "Alias for --auto-approve-tools")
	cmd.Flags().Bool("experimental-yolo", false, "Deprecated: use --auto-approve-tools")
	cmd.Flags().Bool("truncate", false, "For embedding models: truncate inputs exceeding context length (default: true). Set --truncate=false to error instead")
	cmd.Flags().Int("dimensions", 0, "Truncate output embeddings to specified dimension (embedding models only)")
	cmd.Flags().Bool("experimental", false, "Deprecated: agent chat is enabled by default")
	cmd.Flags().Bool("experimental-websearch", false, "Deprecated: web tools are enabled by default when available")
	_ = cmd.Flags().MarkHidden("experimental-yolo")
	_ = cmd.Flags().MarkHidden("experimental")
	_ = cmd.Flags().MarkHidden("experimental-websearch")

	imagegen.RegisterFlags(cmd)

	cmd.Flags().Bool("imagegen", false, "Use the imagegen runner for LLM inference")
	_ = cmd.Flags().MarkHidden("imagegen")
}

var (
	runHandler                    = RunHandler
	rootAgentHandler              = runAgentModelPicker
	agentOnboardingPrompt         = tui.RunAgentSignInOnboarding
	agentOnboardingSignIn         = runAgentOnboardingSignIn
	agentOnboardingSignedInStatus = runAgentOnboardingSignedInStatus
	errAgentOnboardingNotSignedIn = errors.New("not signed in")
)

func runRootResume(rootCmd, runCmd *cobra.Command, args []string) error {
	if err := prepareRootResumeRunCommand(rootCmd, runCmd); err != nil {
		return err
	}
	if runCmd.PreRunE != nil {
		if err := runCmd.PreRunE(runCmd, args); err != nil {
			return err
		}
	}
	return runHandler(runCmd, args)
}

func runRootModel(rootCmd, runCmd *cobra.Command, modelName string, args []string) error {
	if modelName == "" {
		return errors.New("model is required")
	}
	if err := prepareRootModelRunCommand(rootCmd, runCmd); err != nil {
		return err
	}

	runArgs := append([]string{modelName}, args...)
	if runCmd.PreRunE != nil {
		if err := runCmd.PreRunE(runCmd, runArgs); err != nil {
			return err
		}
	}
	return runHandler(runCmd, runArgs)
}

func RunServer(_ *cobra.Command, _ []string) error {
	if err := initializeKeypair(); err != nil {
		return err
	}

	ln, err := net.Listen("tcp", envconfig.Host().Host)
	if err != nil {
		return err
	}

	err = server.Serve(ln)
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}

	return err
}

func checkServerHeartbeat(cmd *cobra.Command, _ []string) error {
	client, err := api.ClientFromEnvironment()
	if err != nil {
		return err
	}
	if err := client.Heartbeat(cmd.Context()); err != nil {
		if !(strings.Contains(err.Error(), " refused") || strings.Contains(err.Error(), "could not connect")) {
			return err
		}
		if err := startApp(cmd.Context(), client); err != nil {
			return err
		}
	}
	return nil
}

func versionHandler(cmd *cobra.Command, _ []string) {
	serverVersion, err := client.New().Version(cmd.Context())
	if err != nil {
		fmt.Println("Warning: could not connect to a running Ollama instance")
	}

	if serverVersion != "" {
		fmt.Printf("ollama version is %s\n", serverVersion)
	}

	if serverVersion != version.Version {
		fmt.Printf("Warning: client version is %s\n", version.Version)
	}
}

func appendEnvDocs(cmd *cobra.Command, envs []envconfig.EnvVar) {
	if len(envs) == 0 {
		return
	}

	envUsage := `
Environment Variables:
`
	for _, e := range envs {
		envUsage += fmt.Sprintf("      %-27s   %s\n", e.Name, e.Description)
	}

	cmd.SetUsageTemplate(cmd.UsageTemplate() + envUsage)
}

func launchInteractiveModel(cmd *cobra.Command, modelName string) error {
	client, err := api.ClientFromEnvironment()
	if err != nil {
		return err
	}

	opts := agentTUIOptions{
		Model:   modelName,
		Options: map[string]any{},
	}
	info, err := prepareAgentModel(cmd, client, &opts, false)
	if err != nil {
		if handleCloudAuthorizationError(err) {
			return nil
		}
		return err
	}
	opts.System = info.System

	if err := saveLastAgentModel(opts.Model); err != nil {
		return err
	}
	if err := GenerateAgentTUI(cmd, client, opts); err != nil {
		if handleCloudAuthorizationError(err) {
			return nil
		}
		return fmt.Errorf("error running agent: %w", err)
	}
	return nil
}

func runAgentModelPicker(cmd *cobra.Command) {
	if err := ensureServerRunning(cmd.Context()); err != nil {
		fmt.Fprintf(os.Stderr, "Error starting server: %v\n", err)
		return
	}

	signIn, err := maybeRunAgentOnboarding(cmd.Context())
	if errors.Is(err, launch.ErrCancelled) {
		return
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		return
	}
	if signIn {
		if err := agentOnboardingSignIn(cmd.Context()); err != nil && !errors.Is(err, launch.ErrCancelled) {
			fmt.Fprintf(os.Stderr, "Warning: unable to sign in: %v\n\n", err)
		}
	}

	accountPrefetch := launch.StartAccountStatePrefetch(cmd.Context())
	deps := agentModelPickerDeps{
		resolveRunModel:     launch.ResolveRunModel,
		runModel:            launchInteractiveModel,
		accountState:        accountPrefetch.StateIfReady,
		accountStateUpdates: accountPrefetch.StateUpdates,
	}
	if err := runAgentModelPickerWithDeps(cmd, deps); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
	}
}

func maybeRunAgentOnboarding(ctx context.Context) (bool, error) {
	if envconfig.NoCloud() || config.AgentSignInPromptSeen() {
		return false, nil
	}

	signedIn, known := agentOnboardingSignedInStatus(ctx)
	if signedIn {
		return false, config.SetAgentSignInPromptSeen(true)
	}
	if !known {
		return false, nil
	}

	signIn, err := agentOnboardingPrompt()
	if errors.Is(err, tui.ErrCancelled) {
		return false, launch.ErrCancelled
	}
	if err != nil {
		return false, err
	}
	if err := config.SetAgentSignInPromptSeen(true); err != nil {
		return false, err
	}
	return signIn, nil
}

func runAgentOnboardingSignedInStatus(ctx context.Context) (signedIn bool, known bool) {
	client, err := api.ClientFromEnvironment()
	if err != nil {
		return false, false
	}
	user, err := client.Whoami(ctx)
	if err == nil {
		return user != nil && user.Name != "", true
	}
	var authErr api.AuthorizationError
	if errors.As(err, &authErr) {
		return false, true
	}
	return false, false
}

func runAgentOnboardingSignIn(ctx context.Context) error {
	client, err := api.ClientFromEnvironment()
	if err != nil {
		return err
	}

	user, err := client.Whoami(ctx)
	if err == nil && user != nil && user.Name != "" {
		return nil
	}
	if err == nil {
		return errAgentOnboardingNotSignedIn
	}

	var authErr api.AuthorizationError
	if !errors.As(err, &authErr) || authErr.SigninURL == "" {
		return err
	}

	_, err = tui.RunSignIn("Ollama", authErr.SigninURL)
	if errors.Is(err, tui.ErrCancelled) {
		return launch.ErrCancelled
	}
	return err
}

type agentModelPickerDeps struct {
	resolveRunModel     func(context.Context, launch.RunModelRequest) (string, error)
	runModel            func(*cobra.Command, string) error
	accountState        func() *launch.AccountState
	accountStateUpdates func(context.Context) <-chan *launch.AccountState
}

func runAgentModelPickerWithDeps(cmd *cobra.Command, deps agentModelPickerDeps) error {
	req := launch.RunModelRequest{}
	if deps.accountState != nil {
		req.AccountState = deps.accountState()
		req.AccountStateProvider = deps.accountState
	}
	req.AccountStateUpdates = deps.accountStateUpdates

	modelName, err := deps.resolveRunModel(cmd.Context(), req)
	if errors.Is(err, launch.ErrCancelled) {
		return nil
	}
	if errors.Is(err, launch.ErrPlanVerificationUnavailable) && !req.ForcePicker {
		req.ForcePicker = true
		req.AccountState = &launch.AccountState{}
		req.AccountStateProvider = nil
		modelName, err = deps.resolveRunModel(cmd.Context(), req)
		if errors.Is(err, launch.ErrCancelled) {
			return nil
		}
	}
	if err != nil {
		return fmt.Errorf("selecting model: %w", err)
	}
	return deps.runModel(cmd, modelName)
}

// runInteractiveTUI runs the main interactive TUI menu.
func runInteractiveTUI(cmd *cobra.Command) {
	// Ensure the server is running via the shared checkServerHeartbeat path.
	if err := checkServerHeartbeat(cmd, nil); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		return
	}

	accountPrefetch := launch.StartAccountStatePrefetch(cmd.Context())
	deps := launcherDeps{
		buildState:          launch.BuildLauncherState,
		runMenu:             tui.RunMenu,
		resolveRunModel:     launch.ResolveRunModel,
		launchIntegration:   launch.LaunchIntegration,
		runModel:            launchInteractiveModel,
		accountState:        accountPrefetch.StateIfReady,
		accountStateUpdates: accountPrefetch.StateUpdates,
	}

	for {
		continueLoop, err := runInteractiveTUIStep(cmd, deps)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		}
		if !continueLoop {
			return
		}
	}
}

type launcherDeps struct {
	buildState          func(context.Context) (*launch.LauncherState, error)
	runMenu             func(*launch.LauncherState) (tui.TUIAction, error)
	resolveRunModel     func(context.Context, launch.RunModelRequest) (string, error)
	launchIntegration   func(context.Context, launch.IntegrationLaunchRequest) error
	runModel            func(*cobra.Command, string) error
	accountState        func() *launch.AccountState
	accountStateUpdates func(context.Context) <-chan *launch.AccountState
}

func runInteractiveTUIStep(cmd *cobra.Command, deps launcherDeps) (bool, error) {
	state, err := deps.buildState(cmd.Context())
	if err != nil {
		return false, fmt.Errorf("build launcher state: %w", err)
	}
	if state != nil && deps.accountState != nil {
		state.AccountState = deps.accountState()
	}

	action, err := deps.runMenu(state)
	if err != nil {
		return false, fmt.Errorf("run launcher menu: %w", err)
	}

	return runLauncherAction(cmd, action, deps)
}

func saveLauncherSelection(action tui.TUIAction) {
	// Best effort only: this affects menu recall, not launch correctness.
	_ = config.SetLastSelection(action.LastSelection())
}

func runLauncherAction(cmd *cobra.Command, action tui.TUIAction, deps launcherDeps) (bool, error) {
	switch action.Kind {
	case tui.TUIActionNone:
		return false, nil
	case tui.TUIActionRunModel:
		saveLauncherSelection(action)
		req := action.RunModelRequest()
		if deps.accountState != nil {
			req.AccountState = deps.accountState()
			req.AccountStateProvider = deps.accountState
		}
		req.AccountStateUpdates = deps.accountStateUpdates
		modelName, err := deps.resolveRunModel(cmd.Context(), req)
		if errors.Is(err, launch.ErrCancelled) {
			return true, nil
		}
		if err != nil {
			return true, fmt.Errorf("selecting model: %w", err)
		}
		if err := deps.runModel(cmd, modelName); err != nil {
			return true, err
		}
		return true, nil
	case tui.TUIActionLaunchIntegration:
		saveLauncherSelection(action)
		req := action.IntegrationLaunchRequest()
		if deps.accountState != nil {
			req.AccountState = deps.accountState()
			req.AccountStateProvider = deps.accountState
		}
		req.AccountStateUpdates = deps.accountStateUpdates
		err := deps.launchIntegration(cmd.Context(), req)
		if errors.Is(err, launch.ErrCancelled) {
			return true, nil
		}
		if err != nil {
			return true, fmt.Errorf("launching %s: %w", action.Integration, err)
		}
		if launcherActionExitsLoop(action.Integration) {
			return false, nil
		}
		return true, nil
	default:
		return false, fmt.Errorf("unknown launcher action: %d", action.Kind)
	}
}

func launcherActionExitsLoop(integration string) bool {
	switch integration {
	case "chatgpt", "codex-app", "vscode":
		return true
	default:
		return false
	}
}

func NewCLI() *cobra.Command {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	cobra.EnableCommandSorting = false

	if runtime.GOOS == "windows" && term.IsTerminal(int(os.Stdout.Fd())) {
		console.ConsoleFromFile(os.Stdin) //nolint:errcheck
	}

	var runCmd *cobra.Command
	rootCmd := &cobra.Command{
		Use:           "ollama",
		Short:         "Run the Ollama interactive menu",
		SilenceUsage:  true,
		SilenceErrors: true,
		CompletionOptions: cobra.CompletionOptions{
			DisableDefaultCmd: true,
		},
		RunE: func(cmd *cobra.Command, args []string) error {
			if version, _ := cmd.Flags().GetBool("version"); version {
				versionHandler(cmd, args)
				return nil
			}

			if resume, _ := cmd.Flags().GetBool("resume"); resume {
				modelName, _ := cmd.Flags().GetString("model")
				if modelName != "" {
					args = append([]string{modelName}, args...)
				}
				return runRootResume(cmd, runCmd, args)
			}

			if modelName, _ := cmd.Flags().GetString("model"); modelName != "" {
				return runRootModel(cmd, runCmd, modelName, args)
			}

			rootAgentHandler(cmd)
			return nil
		},
	}

	rootCmd.Flags().BoolP("version", "v", false, "Show version information")
	rootCmd.Flags().String("model", "", "Run a model")
	registerRootRunFlags(rootCmd)

	createCmd := &cobra.Command{
		Use:         "create MODEL",
		Short:       "Create a model",
		Args:        cobra.ExactArgs(1),
		PreRunE:     checkServerHeartbeat,
		RunE:        CreateHandler,
		Annotations: envconfig.Usage("OLLAMA_HOST"),
	}

	createCmd.Flags().StringP("file", "f", "", "Name of the Modelfile (default \"Modelfile\")")
	createCmd.Flags().StringP("quantize", "q", "", "Quantize model to this level (e.g. q4_K_M)")
	createCmd.Flags().String("draft-quantize", "", "Quantize draft model to this level")
	createCmd.Flags().Bool("experimental", false, "Enable experimental safetensors model creation")

	showCmd := &cobra.Command{
		Use:         "show MODEL",
		Short:       "Show information for a model",
		Args:        cobra.ExactArgs(1),
		PreRunE:     checkServerHeartbeat,
		RunE:        ShowHandler,
		Annotations: envconfig.Usage("OLLAMA_HOST"),
	}

	showCmd.Flags().Bool("model", false, "Show basic stats of a model")
	showCmd.Flags().Bool("license", false, "Show license of a model")
	showCmd.Flags().Bool("modelfile", false, "Show Modelfile of a model")
	showCmd.Flags().Bool("parameters", false, "Show parameters of a model")
	showCmd.Flags().Bool("template", false, "Show template of a model")
	showCmd.Flags().Bool("system", false, "Show system message of a model")
	showCmd.Flags().BoolP("verbose", "v", false, "Show detailed model information")

	runCmd := &cobra.Command{
		Use:         "run MODEL [PROMPT]",
		Short:       "Run a model",
		Args:        cobra.MinimumNArgs(1),
		PreRunE:     checkServerHeartbeat,
		RunE:        RunHandler,
		Annotations: envconfig.Usage("OLLAMA_HOST", "OLLAMA_NOHISTORY"),
	}

	runCmd.Flags().Bool("speech", false, "Speech to text mode")
	runCmd.Flags().String("keepalive", "", "Duration to keep a model loaded (e.g. 5m)")
	runCmd.Flags().Bool("verbose", false, "Show timings for response")
	runCmd.Flags().Bool("insecure", false, "Use an insecure registry")
	runCmd.Flags().Bool("nowordwrap", false, "Don't wrap words to the next line automatically")
	runCmd.Flags().String("format", "", "Response format (e.g. json)")
	runCmd.Flags().String("think", "", "Enable thinking mode: true/false or high/medium/low for supported models")
	runCmd.Flags().Lookup("think").NoOptDefVal = "true"
	runCmd.Flags().Bool("hidethinking", false, "Hide thinking output (if provided)")
	runCmd.Flags().Bool("truncate", false, "For embedding models: truncate inputs exceeding context length (default: true). Set --truncate=false to error instead")
	runCmd.Flags().Int("dimensions", 0, "Truncate output embeddings to specified dimension (embedding models only)")
	runCmd.Flags().Bool("experimental", false, "Enable experimental agent loop with tools")
	runCmd.Flags().BoolP("yolo", "y", false, "Skip all tool approval prompts (use with caution)")

	stopCmd := &cobra.Command{
		Use:         "stop MODEL",
		Short:       "Stop a running model",
		Args:        cobra.ExactArgs(1),
		PreRunE:     checkServerHeartbeat,
		RunE:        StopHandler,
		Annotations: envconfig.Usage("OLLAMA_HOST"),
	}

	serveCmd := &cobra.Command{
		Use:     "serve",
		Aliases: []string{"start"},
		Short:   "Start Ollama",
		Args:    cobra.ExactArgs(0),
		RunE:    RunServer,
		Annotations: envconfig.Usage(
			"OLLAMA_DEBUG",
			"OLLAMA_HOST",
			"OLLAMA_CONTEXT_LENGTH",
			"OLLAMA_KEEP_ALIVE",
			"OLLAMA_MAX_LOADED_MODELS",
			"OLLAMA_MAX_QUEUE",
			"OLLAMA_MODELS",
			"OLLAMA_NUM_PARALLEL",
			"OLLAMA_NOPRUNE",
			"OLLAMA_ORIGINS",
			"OLLAMA_SCHED_SPREAD",
			"OLLAMA_FLASH_ATTENTION",
			"OLLAMA_KV_CACHE_TYPE",
			"OLLAMA_LLM_LIBRARY",
			"OLLAMA_GPU_OVERHEAD",
			"OLLAMA_LOAD_TIMEOUT",
		),
	}

	pullCmd := &cobra.Command{
		Use:         "pull MODEL",
		Short:       "Pull a model from a registry",
		Args:        cobra.ExactArgs(1),
		PreRunE:     checkServerHeartbeat,
		RunE:        PullHandler,
		Annotations: envconfig.Usage("OLLAMA_HOST"),
	}

	pullCmd.Flags().Bool("insecure", false, "Use an insecure registry")
	pullCmd.Flags().Bool("upgrade-all", false, "Upgrade all models if they're out of date")

	pushCmd := &cobra.Command{
		Use:         "push MODEL",
		Short:       "Push a model to a registry",
		Args:        cobra.ExactArgs(1),
		PreRunE:     checkServerHeartbeat,
		RunE:        PushHandler,
		Annotations: envconfig.Usage("OLLAMA_HOST"),
	}

	pushCmd.Flags().Bool("insecure", false, "Use an insecure registry")

	signinCmd := &cobra.Command{
		Use:     "signin",
		Short:   "Sign in to ollama.com",
		Args:    cobra.ExactArgs(0),
		PreRunE: checkServerHeartbeat,
		RunE:    SigninHandler,
	}

	loginCmd := &cobra.Command{
		Use:     "login",
		Short:   "Sign in to ollama.com",
		Hidden:  true,
		Args:    cobra.ExactArgs(0),
		PreRunE: checkServerHeartbeat,
		RunE:    SigninHandler,
	}

	signoutCmd := &cobra.Command{
		Use:     "signout",
		Short:   "Sign out from ollama.com",
		Args:    cobra.ExactArgs(0),
		PreRunE: checkServerHeartbeat,
		RunE:    SignoutHandler,
	}

	logoutCmd := &cobra.Command{
		Use:     "logout",
		Short:   "Sign out from ollama.com",
		Hidden:  true,
		Args:    cobra.ExactArgs(0),
		PreRunE: checkServerHeartbeat,
		RunE:    SignoutHandler,
	}

	usageCmd := &cobra.Command{
		Use:     "usage",
		Short:   "Show your ollama.com usage",
		Args:    cobra.ExactArgs(0),
		PreRunE: checkServerHeartbeat,
		RunE:    UsageHandler,
	}

	listCmd := &cobra.Command{
		Use:         "list",
		Aliases:     []string{"ls"},
		Short:       "List models",
		PreRunE:     checkServerHeartbeat,
		RunE:        ListHandler,
		Annotations: envconfig.Usage("OLLAMA_HOST"),
	}

	psCmd := &cobra.Command{
		Use:         "ps",
		Short:       "List running models",
		PreRunE:     checkServerHeartbeat,
		RunE:        ListRunningHandler,
		Annotations: envconfig.Usage("OLLAMA_HOST"),
	}

	copyCmd := &cobra.Command{
		Use:         "cp SOURCE DESTINATION",
		Short:       "Copy a model",
		Args:        cobra.ExactArgs(2),
		PreRunE:     checkServerHeartbeat,
		RunE:        CopyHandler,
		Annotations: envconfig.Usage("OLLAMA_HOST"),
	}

	deleteCmd := &cobra.Command{
		Use:         "rm MODEL [MODEL...]",
		Short:       "Remove a model",
		Args:        cobra.MinimumNArgs(1),
		PreRunE:     checkServerHeartbeat,
		RunE:        DeleteHandler,
		Annotations: envconfig.Usage("OLLAMA_HOST"),
	}

	runnerCmd := &cobra.Command{
		Use:    "runner",
		Hidden: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runner.Execute(os.Args[2:])
		},
		FParseErrWhitelist: cobra.FParseErrWhitelist{UnknownFlags: true},
	}
	runnerCmd.SetHelpFunc(func(cmd *cobra.Command, args []string) {
		_ = runner.Execute(args[1:])
	})

	var gpuDiscoverLibDirs []string
	gpuDiscoverCmd := &cobra.Command{
		Use:    "gpu-discover",
		Hidden: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return discover.RunNativeProbeCommand(cmd.Context(), gpuDiscoverLibDirs, os.Stdout)
		},
	}
	gpuDiscoverCmd.Flags().StringArrayVar(&gpuDiscoverLibDirs, "lib-dir", nil, "Ollama runtime library directory")

	envVars := envconfig.AsMap()

	envs := []envconfig.EnvVar{envVars["OLLAMA_HOST"]}

	for _, cmd := range []*cobra.Command{
		createCmd,
		showCmd,
		runCmd,
		stopCmd,
		pushCmd,
		usageCmd,
		listCmd,
		psCmd,
		copyCmd,
		serveCmd,
		embedCmd,
	} {
		switch cmd {
		case runCmd:
			appendEnvDocs(cmd, []envconfig.EnvVar{envVars["OLLAMA_EDITOR"], envVars["OLLAMA_HOST"], envVars["OLLAMA_NOHISTORY"]})
		case serveCmd:
			appendEnvDocs(cmd, []envconfig.EnvVar{
				envVars["OLLAMA_DEBUG"],
				envVars["OLLAMA_HOST"],
				envVars["OLLAMA_CONTEXT_LENGTH"],
				envVars["OLLAMA_KEEP_ALIVE"],
				envVars["OLLAMA_MAX_LOADED_MODELS"],
				envVars["OLLAMA_MAX_TRANSFER_STREAMS"],
				envVars["OLLAMA_MAX_QUEUE"],
				envVars["OLLAMA_MODELS"],
				envVars["OLLAMA_NUM_PARALLEL"],
				envVars["OLLAMA_NO_CLOUD"],
				envVars["OLLAMA_NOPRUNE"],
				envVars["OLLAMA_ORIGINS"],
				envVars["OLLAMA_SCHED_SPREAD"],
				envVars["OLLAMA_FLASH_ATTENTION"],
				envVars["OLLAMA_KV_CACHE_TYPE"],
				envVars["OLLAMA_LLM_LIBRARY"],
				envVars["OLLAMA_GPU_OVERHEAD"],
				envVars["OLLAMA_IGPU_ENABLE"],
				envVars["LLAMA_ARG_FIT"],
				envVars["LLAMA_ARG_FIT_TARGET"],
				envVars["OLLAMA_LOAD_TIMEOUT"],
			})
		case pushCmd:
			appendEnvDocs(cmd, []envconfig.EnvVar{envVars["OLLAMA_NONINTERACTIVE"]})
		default:
			appendEnvDocs(cmd, envs)
		}
	}

	updateCmd := &cobra.Command{
		Use:   "update",
		Short: "Update Ollama to the latest version",
		Args:  cobra.ExactArgs(0),
		RunE: func(cmd *cobra.Command, args []string) error {
			force, _ := cmd.Flags().GetBool("force")
			_ = version.ClearCachedUpdate()
			return version.DoUpdate(force)
		},
	}
	updateCmd.Flags().BoolP("force", "f", false, "Force update even if installed via a package manager")

	rootCmd.AddCommand(
		serveCmd,
		createCmd,
		showCmd,
		runCmd,
		stopCmd,
		cmdPull(),
		pushCmd,
		signinCmd,
		loginCmd,
		signoutCmd,
		logoutCmd,
		usageCmd,
		listCmd,
		psCmd,
		copyCmd,
		cmdRemove(),
		runnerCmd,
		gpuDiscoverCmd,
		launch.LaunchCmd(checkServerHeartbeat, runInteractiveTUI),
	)

	rootCmd.SetUsageTemplate(usageTemplate)
	return rootCmd
}

// If the user has explicitly set thinking options, either through the CLI or
// through the `/set think` or `set nothink` interactive options, then we
// respect them. Otherwise, we check model capabilities to see if the model
// supports thinking. If the model does support thinking, we enable it.
// Otherwise, we unset the thinking option (which is different than setting it
// to false).
//
// If capabilities are not provided, we fetch them from the server.
func inferThinkingOption(caps *[]model.Capability, runOpts *runOptions, explicitlySetByUser bool) (*api.ThinkValue, error) {
	if explicitlySetByUser {
		return runOpts.Think, nil
	}

	if caps == nil {
		client, err := api.ClientFromEnvironment()
		if err != nil {
			return nil, err
		}
		ret, err := client.Show(context.Background(), &api.ShowRequest{
			Model: runOpts.Model,
		})
		if err != nil {
			return nil, err
		}
		caps = &ret.Capabilities
	}

	thinkingSupported := false
	for _, cap := range *caps {
		if cap == model.CapabilityThinking {
			thinkingSupported = true
		}
	}

	if thinkingSupported {
		return &api.ThinkValue{Value: true}, nil
	}

	return nil, nil
}
