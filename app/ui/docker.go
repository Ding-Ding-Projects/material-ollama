//go:build windows || darwin

package ui

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"
)

// This file is the local Docker container manager for the bundled Ollama
// server image. It talks to the "docker" CLI exclusively through fixed,
// validated argv slices -- never a shell string -- the same discipline
// app/ui/codex.go uses for the Codex harness. See resolveDockerExecutable,
// buildContainerRunArgs and validateImageReference for the allow-list
// boundaries; no code path in this file may add --privileged, --cap-add,
// --network host, --pid host, -u, or an arbitrary bind-mount, because the
// argv builder below simply has no branch that produces them.
//
// GPU capability is never assumed from the presence of Docker or an NVIDIA
// driver. It is established by actually running a probe container and
// reading what comes back (see (*dockerManager).probeGPU); the create
// endpoint only ever adds --gpus all when that probe's cached verdict says
// "gpu-available", and it says so explicitly in its response either way so
// a container never silently ends up CPU-only without the caller knowing.
//
// State (the manager's own fields) is kept in a package-level singleton
// rather than a Server field: this lane's allowed edits to ui.go are
// limited to route registration inside Handler(), so the Server struct
// itself is out of scope here.

const (
	dockerContainerName = "material-ollama-server"
	dockerVolumeName    = "material-ollama-models"

	dockerCommandTimeout = 15 * time.Second
	dockerStopTimeout    = 30 * time.Second
	dockerCreateTimeout  = 6 * time.Minute
	dockerProbeTimeout   = 3 * time.Minute
)

// dockerAllowedImageRepos is the compiled-in image allow-list. Only
// "ollama/ollama" is known to exist as a published repo for this project
// (scripts/env.sh defaults FINAL_IMAGE_REPO to "${DOCKER_ORG}/ollama" with
// DOCKER_ORG="ollama"); a distinct material-ollama-branded repo was not
// found anywhere in this checkout, so it is deliberately not invented here.
var dockerAllowedImageRepos = []string{"ollama/ollama"}

var (
	dockerTagRE    = regexp.MustCompile(`^[A-Za-z0-9._-]{1,128}$`)
	dockerDigestRE = regexp.MustCompile(`^sha256:[a-f0-9]{64}$`)
)

// dockerCLICandidates holds extra absolute paths to try before falling
// back to a PATH lookup of "docker". It is populated per platform -- see
// docker_windows.go's init() for the Windows Docker Desktop layout. It is
// intentionally left empty on darwin: Docker Desktop for Mac reliably
// symlinks "docker" onto PATH, so a PATH lookup alone is sufficient there.
var dockerCLICandidates []string

// TriState is a yes/no/unknown fact about the host, distinct from a plain
// bool so "we never checked" is not silently indistinguishable from "we
// checked and it's false".
type TriState string

const (
	TriStateUnknown TriState = "unknown"
	TriStateYes     TriState = "yes"
	TriStateNo      TriState = "no"
)

// GPUCapability is the result of the full, real probe sequence: docker
// version, docker info, and -- the decisive step -- an actual container
// run that reports what it can see. Never populated by assumption.
type GPUCapability struct {
	DockerPresent   bool      `json:"dockerPresent"`
	DockerVersion   string    `json:"dockerVersion,omitempty"`
	Backend         string    `json:"backend"` // "wsl2" | "hyper-v" | "windows-containers" | "unknown"
	NvidiaRuntime   TriState  `json:"nvidiaRuntime"`
	ToolkitDetected TriState  `json:"toolkitDetected"`
	ProbeResult     string    `json:"probeResult"` // "gpu-visible" | "no-gpu-in-container" | "flag-rejected" | "not-run"
	ProbeDetail     string    `json:"probeDetail,omitempty"`
	DevicesSeen     []string  `json:"devicesSeen,omitempty"`
	Verdict         string    `json:"verdict"` // "gpu-available" | "cpu-only" | "unknown"
	Reason          string    `json:"reason,omitempty"`
	NextStep        string    `json:"nextStep,omitempty"`
	CheckedAt       time.Time `json:"checkedAt"`
}

// DockerStatus is the cheap, fast summary shown by GET /status: whether
// Docker is present at all, its version, and its backend classification.
// It never re-runs the (potentially slow, potentially image-pulling) GPU
// probe -- that only happens from an explicit POST /probe-gpu.
type DockerStatus struct {
	Present        bool      `json:"present"`
	ExecutablePath string    `json:"executablePath,omitempty"`
	Version        string    `json:"version,omitempty"`
	ServerVersion  string    `json:"serverVersion,omitempty"`
	OSType         string    `json:"osType,omitempty"`
	KernelVersion  string    `json:"kernelVersion,omitempty"`
	Backend        string    `json:"backend,omitempty"`
	Error          string    `json:"error,omitempty"`
	CheckedAt      time.Time `json:"checkedAt"`
}

// ContainerRecord is the server's view of the one fixed-name container
// this manager owns, merged from "docker inspect" (state, image, restart
// policy, resources, host port) and this manager's own post-start GPU
// confirmation (docker inspect alone cannot say whether devices are
// actually visible inside the container -- only whether --gpus was
// requested).
type ContainerRecord struct {
	Name          string    `json:"name"`
	Image         string    `json:"image,omitempty"`
	State         string    `json:"state,omitempty"`
	HostPort      int       `json:"hostPort,omitempty"`
	RestartPolicy string    `json:"restartPolicy,omitempty"`
	MemoryGB      float64   `json:"memoryGb,omitempty"`
	CPUs          float64   `json:"cpus,omitempty"`
	GPURequested  bool      `json:"gpuRequested"`
	GPUAttached   bool      `json:"gpuAttached"`
	CreatedAt     time.Time `json:"createdAt,omitempty"`
}

// ContainerHealth separates *container state* (docker inspect's own
// opinion) from *health* (a real HTTP round trip to the Ollama API this
// container is supposed to be serving). A running container with a dead
// API is the common real failure and must be visible as such.
type ContainerHealth struct {
	ContainerState string    `json:"containerState"`
	APIHealthy     bool      `json:"apiHealthy"`
	APIDetail      string    `json:"apiDetail,omitempty"`
	APIVersion     string    `json:"apiVersion,omitempty"`
	CheckedAt      time.Time `json:"checkedAt"`
}

// ContainerCreateRequest is the only input shape accepted by the create
// endpoint. Every field is validated into a bounded range or a fixed enum
// before it ever reaches an argv slice; there is no free-text path into
// the docker command line.
type ContainerCreateRequest struct {
	Tag           string  `json:"tag,omitempty"`
	Digest        string  `json:"digest,omitempty"` // sha256:<64 hex>, preferred over Tag when set
	RestartPolicy string  `json:"restartPolicy,omitempty"`
	HostPort      int     `json:"hostPort,omitempty"`
	MemoryGB      float64 `json:"memoryGb,omitempty"`
	CPUs          float64 `json:"cpus,omitempty"`
	GPUFlavor     string  `json:"gpuFlavor,omitempty"` // "nvidia" | "rocm" | "none" | ""
}

type ContainerCreateResponse struct {
	Container      ContainerRecord `json:"container"`
	Action         string          `json:"action"` // "created-gpu" | "created-cpu-only"
	GPU            *GPUCapability  `json:"gpu,omitempty"`
	Warning        string          `json:"warning,omitempty"`
	CommandPreview string          `json:"commandPreview"`
}

// gpuConfirmation is the persisted result of the post-start "did the
// devices actually show up inside the container" check. Kept separate
// from GPUCapability (which is about the *probe* container) because this
// one is about the real, currently-running container.
type gpuConfirmation struct {
	Requested bool      `json:"requested"`
	Confirmed bool      `json:"confirmed"`
	Detail    string    `json:"detail,omitempty"`
	CheckedAt time.Time `json:"checkedAt"`
	Mismatch  bool      `json:"mismatch"`
}

type dockerStateFile struct {
	Version    int              `json:"version"`
	LastProbe  *GPUCapability   `json:"lastProbe,omitempty"`
	GPUConfirm *gpuConfirmation `json:"gpuConfirm,omitempty"`
}

// dockerManager holds the only state this lane keeps outside of Docker
// itself: the last GPU probe result and the last post-start GPU
// confirmation, persisted so a restart of the desktop app doesn't lose
// them and force a re-probe (which can run a container, possibly after an
// image pull) just to answer a status GET.
type dockerManager struct {
	mu         sync.Mutex
	path       string
	loaded     bool
	lastProbe  *GPUCapability
	gpuConfirm *gpuConfirmation
}

var (
	dockerManagerOnce sync.Once
	dockerManagerInst *dockerManager
)

// getDockerManager returns the process-wide singleton. A package-level
// singleton (rather than a field on *Server) is deliberate: this lane's
// allowed edit to ui.go is route registration only, so the Server struct
// itself is not ours to extend.
func getDockerManager() *dockerManager {
	dockerManagerOnce.Do(func() {
		dockerManagerInst = &dockerManager{path: dockerStatePath()}
	})
	return dockerManagerInst
}

func dockerStatePath() string {
	if runtime.GOOS == "windows" {
		return filepath.Join(os.Getenv("LOCALAPPDATA"), "Ollama", "docker-manager.json")
	}
	return filepath.Join(os.Getenv("HOME"), "Library", "Application Support", "Ollama", "docker-manager.json")
}

func (m *dockerManager) loadLocked() {
	if m.loaded {
		return
	}
	m.loaded = true
	data, err := os.ReadFile(m.path)
	if err != nil {
		return
	}
	var file dockerStateFile
	if json.Unmarshal(data, &file) != nil || file.Version != 1 {
		return
	}
	m.lastProbe = file.LastProbe
	m.gpuConfirm = file.GPUConfirm
}

func (m *dockerManager) persistLocked() error {
	if err := os.MkdirAll(filepath.Dir(m.path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(dockerStateFile{Version: 1, LastProbe: m.lastProbe, GPUConfirm: m.gpuConfirm}, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(m.path), ".docker-manager-*.json")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpName, m.path)
}

// resolveDockerExecutable resolves the docker CLI to an absolute path,
// trying platform-specific candidates first (see dockerCLICandidates and
// docker_windows.go) and falling back to a PATH lookup. Every handler
// below surfaces this resolved path in its response so the user always
// knows exactly what is being run.
func resolveDockerExecutable() (string, error) {
	for _, candidate := range dockerCLICandidates {
		if candidate == "" {
			continue
		}
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate, nil
		}
	}
	path, err := exec.LookPath("docker")
	if err != nil {
		return "", errors.New("the docker CLI was not found; install Docker Desktop or add docker to PATH")
	}
	return path, nil
}

// validateImageReference resolves a repo/tag/digest triple into a single
// allow-listed image reference. repo is currently always
// dockerAllowedImageRepos[0] (callers don't accept a repo from the
// request body -- there is nothing to allow-list against yet besides the
// one known repo), but the check stays explicit so adding a second
// allowed repo later is a one-line var change, not a new code path.
func validateImageReference(repo, tag, digest string) (string, error) {
	repo = strings.TrimSpace(repo)
	if repo == "" {
		repo = dockerAllowedImageRepos[0]
	}
	if !slices.Contains(dockerAllowedImageRepos, repo) {
		return "", fmt.Errorf("image repository %q is not on the allowlist", repo)
	}
	digest = strings.TrimSpace(digest)
	if digest != "" {
		if !dockerDigestRE.MatchString(digest) {
			return "", errors.New("digest must look like sha256:<64 lowercase hex characters>")
		}
		return repo + "@" + digest, nil
	}
	tag = strings.TrimSpace(tag)
	if tag == "" {
		tag = "latest"
	}
	if !dockerTagRE.MatchString(tag) {
		return "", errors.New("tag must match ^[A-Za-z0-9._-]{1,128}$")
	}
	return repo + ":" + tag, nil
}

func validateRestartPolicy(policy string) (string, error) {
	switch strings.TrimSpace(policy) {
	case "":
		return "unless-stopped", nil
	case "unless-stopped", "always", "no":
		return policy, nil
	default:
		return "", errors.New("restartPolicy must be one of unless-stopped, always, no")
	}
}

func validateHostPort(port int) (int, error) {
	if port == 0 {
		port = 11434
	}
	if port < 1024 || port > 65535 {
		return 0, errors.New("hostPort must be between 1024 and 65535")
	}
	return port, nil
}

func validateMemoryGB(value float64) (float64, error) {
	if value == 0 {
		value = 4
	}
	if value < 1 || value > 512 {
		return 0, errors.New("memoryGb must be between 1 and 512")
	}
	return value, nil
}

func validateCPUs(value float64) (float64, error) {
	if value == 0 {
		value = 2
	}
	if value < 0.1 || value > 128 {
		return 0, errors.New("cpus must be between 0.1 and 128")
	}
	return value, nil
}

// buildContainerRunArgs is the ENTIRE surface that can put flags on a
// "docker run" invocation. There is deliberately no branch here -- now or
// ever -- that can emit --privileged, --cap-add, --network host,
// --pid host, -u, or an arbitrary "-v <host path>": the bind mount is
// always the fixed named volume, the port bind is always loopback-only,
// and --gpus is only ever appended by the one call site that has already
// checked a real probe verdict.
func buildContainerRunArgs(imageRef, restartPolicy string, hostPort int, memoryGB, cpus float64, useGPU bool) []string {
	args := []string{
		"run", "-d",
		"--name", dockerContainerName,
		"--restart", restartPolicy,
		"-p", fmt.Sprintf("127.0.0.1:%d:11434", hostPort),
		"-v", dockerVolumeName + ":/root/.ollama",
		"--memory", strconv.FormatFloat(memoryGB, 'g', -1, 64) + "g",
		"--cpus", strconv.FormatFloat(cpus, 'g', -1, 64),
	}
	if useGPU {
		args = append(args, "--gpus", "all")
	}
	return append(args, imageRef)
}

func dockerCommandPreview(execPath string, args []string) string {
	parts := make([]string, 0, len(args)+1)
	parts = append(parts, quoteCodexArg(execPath))
	for _, arg := range args {
		parts = append(parts, quoteCodexArg(arg))
	}
	return strings.Join(parts, " ")
}

// --- docker CLI plumbing -----------------------------------------------

type dockerVersionSummary struct {
	ClientVersion string
	ServerVersion string
}

func dockerVersionInfo(ctx context.Context, execPath string) (dockerVersionSummary, error) {
	out, err := exec.CommandContext(ctx, execPath, "version", "--format", "{{json .}}").Output()
	if err != nil {
		return dockerVersionSummary{}, dockerCommandError("docker version", out, err)
	}
	var raw struct {
		Client struct {
			Version string `json:"Version"`
		} `json:"Client"`
		Server struct {
			Version string `json:"Version"`
		} `json:"Server"`
	}
	if err := json.Unmarshal(out, &raw); err != nil {
		return dockerVersionSummary{}, fmt.Errorf("parse docker version output: %w", err)
	}
	return dockerVersionSummary{ClientVersion: raw.Client.Version, ServerVersion: raw.Server.Version}, nil
}

type dockerInfoSummary struct {
	OSType        string
	KernelVersion string
	Runtimes      map[string]json.RawMessage
}

func dockerInfo(ctx context.Context, execPath string) (dockerInfoSummary, error) {
	out, err := exec.CommandContext(ctx, execPath, "info", "--format", "{{json .}}").Output()
	if err != nil {
		return dockerInfoSummary{}, dockerCommandError("docker info", out, err)
	}
	var raw struct {
		OSType        string                     `json:"OSType"`
		KernelVersion string                     `json:"KernelVersion"`
		Runtimes      map[string]json.RawMessage `json:"Runtimes"`
	}
	if err := json.Unmarshal(out, &raw); err != nil {
		return dockerInfoSummary{}, fmt.Errorf("parse docker info output: %w", err)
	}
	return dockerInfoSummary{OSType: raw.OSType, KernelVersion: raw.KernelVersion, Runtimes: raw.Runtimes}, nil
}

// classifyDockerBackend distinguishes WSL2 from Hyper-V from Windows
// containers using only fields already present in "docker info" output --
// no read of Docker Desktop's own settings file is needed. The WSL2
// backend's Linux VM reports a kernel version containing
// "microsoft-standard-WSL2"; the legacy Hyper-V/LinuxKit VM reports a
// "-linuxkit" kernel. This is the fact GPU passthrough hinges on: NVIDIA
// passthrough to Linux containers on Windows requires the WSL2 backend.
func classifyDockerBackend(osType, kernelVersion string) string {
	if runtime.GOOS != "windows" {
		return "unknown"
	}
	switch osType {
	case "windows":
		return "windows-containers"
	case "linux":
		lower := strings.ToLower(kernelVersion)
		switch {
		case strings.Contains(lower, "microsoft-standard-wsl2"), strings.Contains(lower, "-wsl2"):
			return "wsl2"
		case strings.Contains(lower, "linuxkit"):
			return "hyper-v"
		default:
			return "unknown"
		}
	default:
		return "unknown"
	}
}

func dockerImagePresentLocally(ctx context.Context, execPath, ref string) bool {
	return exec.CommandContext(ctx, execPath, "image", "inspect", ref).Run() == nil
}

func dockerDefaultProbeImage() string {
	return dockerAllowedImageRepos[0] + ":latest"
}

// runDockerProbeContainer is the decisive GPU probe step: it actually
// starts a container with --gpus all and asks it what it can see, rather
// than inferring anything from the host. /bin/sh -c is used inside the
// container (its own shell, not ours) purely to run "ls" against two
// fixed, hard-coded paths -- no user input reaches this string.
func runDockerProbeContainer(ctx context.Context, execPath, image string) (string, error) {
	args := []string{
		"run", "--rm", "--gpus", "all",
		"--entrypoint", "/bin/sh",
		image,
		"-c", "ls /dev/dri /proc/driver/nvidia 2>&1",
	}
	out, err := exec.CommandContext(ctx, execPath, args...).CombinedOutput()
	return string(out), err
}

// parseProbeDevices turns "ls /dev/dri /proc/driver/nvidia" output (a
// per-directory listing, each preceded by a "<dir>:" header line) into a
// flat list of "<dir>/<entry>" device paths. The raw text is always kept
// verbatim in GPUCapability.ProbeDetail regardless of what this parses.
func parseProbeDevices(detail string) []string {
	var devices []string
	currentDir := ""
	for _, raw := range strings.Split(detail, "\n") {
		line := strings.TrimRight(raw, "\r")
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			currentDir = ""
			continue
		}
		lower := strings.ToLower(trimmed)
		if strings.Contains(lower, "no such file") || strings.Contains(lower, "cannot access") {
			continue
		}
		if strings.HasSuffix(trimmed, ":") && (strings.HasPrefix(trimmed, "/dev") || strings.HasPrefix(trimmed, "/proc")) {
			currentDir = strings.TrimSuffix(trimmed, ":")
			continue
		}
		if currentDir == "" {
			continue
		}
		for _, entry := range strings.Fields(trimmed) {
			devices = append(devices, currentDir+"/"+entry)
		}
	}
	return devices
}

// probeGPU runs the full sequence described in this lane's spec: docker
// version, docker info (for backend classification and whether an nvidia
// runtime is registered), and -- only once a WSL2 backend is confirmed --
// the decisive probe container. Every early return sets Verdict, Reason
// and NextStep so the caller never has to guess why.
func (m *dockerManager) probeGPU(ctx context.Context, execPath string) GPUCapability {
	result := GPUCapability{
		CheckedAt:       time.Now(),
		ProbeResult:     "not-run",
		Verdict:         "unknown",
		Backend:         "unknown",
		NvidiaRuntime:   TriStateUnknown,
		ToolkitDetected: TriStateUnknown,
	}

	versionCtx, cancel := context.WithTimeout(ctx, dockerCommandTimeout)
	ver, verr := dockerVersionInfo(versionCtx, execPath)
	cancel()
	if verr != nil {
		result.DockerPresent = false
		result.Reason = "docker version failed: " + redactText(verr.Error())
		result.NextStep = "Install Docker Desktop, start it, and try again."
		return result
	}
	result.DockerPresent = true
	result.DockerVersion = ver.ClientVersion

	infoCtx, cancel := context.WithTimeout(ctx, dockerCommandTimeout)
	info, ierr := dockerInfo(infoCtx, execPath)
	cancel()
	if ierr != nil {
		result.Reason = "docker info failed: " + redactText(ierr.Error())
		result.NextStep = "Make sure Docker Desktop is running, then try again."
		return result
	}
	result.Backend = classifyDockerBackend(info.OSType, info.KernelVersion)
	if _, ok := info.Runtimes["nvidia"]; ok {
		result.NvidiaRuntime = TriStateYes
	} else {
		result.NvidiaRuntime = TriStateNo
	}

	if result.Backend != "wsl2" {
		result.Verdict = "cpu-only"
		result.Reason = "Docker Desktop is not using the WSL2 backend"
		result.NextStep = "Docker Desktop -> Settings -> General -> Use the WSL 2 based engine."
		return result
	}

	image := dockerDefaultProbeImage()
	presentCtx, cancel := context.WithTimeout(ctx, dockerCommandTimeout)
	present := dockerImagePresentLocally(presentCtx, execPath, image)
	cancel()
	if !present {
		result.Verdict = "unknown"
		result.Reason = fmt.Sprintf("the %s image is not pulled locally yet, so the decisive GPU probe was not run (it would otherwise trigger a multi-gigabyte pull as a side effect of a status check)", image)
		result.NextStep = "Pull ollama/ollama (or create the container once), then probe again."
		return result
	}

	probeCtx, cancel := context.WithTimeout(ctx, dockerProbeTimeout)
	detail, runErr := runDockerProbeContainer(probeCtx, execPath, image)
	cancel()
	result.ProbeDetail = redactText(detail)

	lowerDetail := strings.ToLower(detail)
	switch {
	case runErr != nil && (strings.Contains(lowerDetail, "unknown flag: --gpus") ||
		strings.Contains(lowerDetail, "could not select device driver") ||
		strings.Contains(lowerDetail, "unknown or invalid runtime")):
		result.ProbeResult = "flag-rejected"
		result.ToolkitDetected = TriStateNo
		result.Verdict = "cpu-only"
		result.Reason = "Docker rejected --gpus all: the NVIDIA Container Toolkit is not installed or not registered with Docker Desktop"
		result.NextStep = "Install the NVIDIA Container Toolkit and enable GPU support in Docker Desktop, then probe again."
	case runErr != nil:
		result.ProbeResult = "not-run"
		result.Verdict = "unknown"
		result.Reason = "the probe container failed to run: " + redactText(runErr.Error())
		result.NextStep = "Check that Docker Desktop is healthy, then try again."
	default:
		devices := parseProbeDevices(detail)
		if len(devices) == 0 {
			result.ProbeResult = "no-gpu-in-container"
			result.ToolkitDetected = TriStateNo
			result.Verdict = "cpu-only"
			result.Reason = "the probe container ran but no NVIDIA devices were visible inside it"
			result.NextStep = "Confirm a GPU-capable host, current NVIDIA drivers, and the NVIDIA Container Toolkit, then probe again."
		} else {
			result.ProbeResult = "gpu-visible"
			result.ToolkitDetected = TriStateYes
			result.DevicesSeen = devices
			result.Verdict = "gpu-available"
			result.Reason = fmt.Sprintf("%d device path(s) visible inside a --gpus all container", len(devices))
		}
	}
	return result
}

func dockerCommandError(label string, out []byte, err error) error {
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) && len(exitErr.Stderr) > 0 {
		return fmt.Errorf("%s: %s", label, redactText(strings.TrimSpace(string(exitErr.Stderr))))
	}
	if len(out) > 0 {
		return fmt.Errorf("%s: %s", label, redactText(strings.TrimSpace(string(out))))
	}
	return fmt.Errorf("%s: %w", label, err)
}

// --- container inspect / lifecycle --------------------------------------

type dockerInspectState struct {
	Name  string `json:"Name"`
	State struct {
		Status    string `json:"Status"`
		Running   bool   `json:"Running"`
		StartedAt string `json:"StartedAt"`
	} `json:"State"`
	Config struct {
		Image string `json:"Image"`
	} `json:"Config"`
	HostConfig struct {
		RestartPolicy struct {
			Name string `json:"Name"`
		} `json:"RestartPolicy"`
		Memory         int64            `json:"Memory"`
		NanoCpus       int64            `json:"NanoCpus"`
		DeviceRequests []map[string]any `json:"DeviceRequests"`
	} `json:"HostConfig"`
	NetworkSettings struct {
		Ports map[string][]struct {
			HostIP   string `json:"HostIp"`
			HostPort string `json:"HostPort"`
		} `json:"Ports"`
	} `json:"NetworkSettings"`
}

func dockerInspectContainer(ctx context.Context, execPath, name string) (dockerInspectState, error) {
	out, err := exec.CommandContext(ctx, execPath, "inspect", "--format", "{{json .}}", name).Output()
	if err != nil {
		return dockerInspectState{}, dockerCommandError("docker inspect", out, err)
	}
	var state dockerInspectState
	if err := json.Unmarshal(out, &state); err != nil {
		return dockerInspectState{}, fmt.Errorf("parse docker inspect output: %w", err)
	}
	return state, nil
}

func containerRecordFromInspect(state dockerInspectState) ContainerRecord {
	record := ContainerRecord{
		Name:          strings.TrimPrefix(state.Name, "/"),
		Image:         state.Config.Image,
		State:         state.State.Status,
		RestartPolicy: state.HostConfig.RestartPolicy.Name,
		GPURequested:  len(state.HostConfig.DeviceRequests) > 0,
	}
	if state.HostConfig.Memory > 0 {
		record.MemoryGB = float64(state.HostConfig.Memory) / (1024 * 1024 * 1024)
	}
	if state.HostConfig.NanoCpus > 0 {
		record.CPUs = float64(state.HostConfig.NanoCpus) / 1e9
	}
	if bindings, ok := state.NetworkSettings.Ports["11434/tcp"]; ok && len(bindings) > 0 {
		if port, err := strconv.Atoi(bindings[0].HostPort); err == nil {
			record.HostPort = port
		}
	}
	if t, err := time.Parse(time.RFC3339Nano, state.State.StartedAt); err == nil {
		record.CreatedAt = t
	}
	return record
}

func execInContainer(ctx context.Context, execPath, name, shellCommand string) (string, error) {
	out, err := exec.CommandContext(ctx, execPath, "exec", name, "/bin/sh", "-c", shellCommand).CombinedOutput()
	return string(out), err
}

func waitForContainerRunning(ctx context.Context, execPath, name string, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		state, err := dockerInspectContainer(ctx, execPath, name)
		if err == nil && state.State.Running {
			return true
		}
		select {
		case <-ctx.Done():
			return false
		case <-time.After(500 * time.Millisecond):
		}
	}
	return false
}

// --- HTTP handlers -------------------------------------------------------

func (s *Server) dockerStatus(w http.ResponseWriter, r *http.Request) error {
	status := DockerStatus{CheckedAt: time.Now()}
	execPath, err := resolveDockerExecutable()
	if err != nil {
		status.Error = err.Error()
		w.Header().Set("Content-Type", "application/json")
		return json.NewEncoder(w).Encode(map[string]any{"docker": status})
	}
	status.ExecutablePath = execPath

	versionCtx, cancel := context.WithTimeout(r.Context(), dockerCommandTimeout)
	ver, verr := dockerVersionInfo(versionCtx, execPath)
	cancel()
	if verr != nil {
		status.Error = verr.Error()
		w.Header().Set("Content-Type", "application/json")
		return json.NewEncoder(w).Encode(map[string]any{"docker": status})
	}
	status.Present = true
	status.Version = ver.ClientVersion
	status.ServerVersion = ver.ServerVersion

	infoCtx, cancel := context.WithTimeout(r.Context(), dockerCommandTimeout)
	info, ierr := dockerInfo(infoCtx, execPath)
	cancel()
	if ierr != nil {
		status.Error = ierr.Error()
	} else {
		status.OSType = info.OSType
		status.KernelVersion = info.KernelVersion
		status.Backend = classifyDockerBackend(info.OSType, info.KernelVersion)
	}

	manager := getDockerManager()
	manager.mu.Lock()
	manager.loadLocked()
	lastProbe := manager.lastProbe
	manager.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(map[string]any{"docker": status, "lastGpuProbe": lastProbe})
}

// dockerROCmSupport states the Windows/WSL2 ROCm truth bluntly rather than
// letting a caller infer it from an absent field: AMD GPU passthrough to
// Linux containers on Windows is not available because /dev/kfd is not
// exposed through WSL2, so ROCm is listed and explicitly disabled here.
func dockerROCmSupport() (bool, string) {
	if runtime.GOOS == "windows" {
		return false, "AMD ROCm GPU passthrough is not available on Windows/WSL2: /dev/kfd is not exposed to Linux containers."
	}
	return false, "ROCm support has not been verified for this platform by this manager."
}

func (s *Server) dockerProbeGPU(w http.ResponseWriter, r *http.Request) error {
	if r.Method != http.MethodPost {
		return errors.New("method not allowed")
	}
	rocmSupported, rocmReason := dockerROCmSupport()
	execPath, err := resolveDockerExecutable()
	if err != nil {
		result := GPUCapability{
			CheckedAt: time.Now(), DockerPresent: false, Verdict: "unknown", Backend: "unknown",
			ProbeResult: "not-run", NvidiaRuntime: TriStateUnknown, ToolkitDetected: TriStateUnknown,
			Reason: err.Error(), NextStep: "Install Docker Desktop and ensure docker is on PATH.",
		}
		w.Header().Set("Content-Type", "application/json")
		return json.NewEncoder(w).Encode(map[string]any{"gpu": result, "rocmSupported": rocmSupported, "rocmReason": rocmReason})
	}

	manager := getDockerManager()
	result := manager.probeGPU(r.Context(), execPath)
	manager.mu.Lock()
	manager.loadLocked()
	manager.lastProbe = &result
	_ = manager.persistLocked()
	manager.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(map[string]any{"gpu": result, "rocmSupported": rocmSupported, "rocmReason": rocmReason})
}

func (s *Server) dockerContainerGet(w http.ResponseWriter, r *http.Request) error {
	execPath, err := resolveDockerExecutable()
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(r.Context(), dockerCommandTimeout)
	defer cancel()
	state, err := dockerInspectContainer(ctx, execPath, dockerContainerName)
	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		return json.NewEncoder(w).Encode(map[string]any{"present": false})
	}
	record := containerRecordFromInspect(state)

	manager := getDockerManager()
	manager.mu.Lock()
	manager.loadLocked()
	confirm := manager.gpuConfirm
	manager.mu.Unlock()
	if confirm != nil {
		record.GPUAttached = confirm.Confirmed
	}
	return json.NewEncoder(w).Encode(map[string]any{"present": true, "container": record})
}

func (s *Server) dockerContainerCreate(w http.ResponseWriter, r *http.Request) error {
	if r.Method != http.MethodPost {
		return errors.New("method not allowed")
	}
	var req ContainerCreateRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 64*1024)).Decode(&req); err != nil {
		return fmt.Errorf("invalid container create request: %w", err)
	}

	execPath, err := resolveDockerExecutable()
	if err != nil {
		return err
	}
	imageRef, err := validateImageReference(dockerAllowedImageRepos[0], req.Tag, req.Digest)
	if err != nil {
		return err
	}
	restartPolicy, err := validateRestartPolicy(req.RestartPolicy)
	if err != nil {
		return err
	}
	hostPort, err := validateHostPort(req.HostPort)
	if err != nil {
		return err
	}
	memoryGB, err := validateMemoryGB(req.MemoryGB)
	if err != nil {
		return err
	}
	cpus, err := validateCPUs(req.CPUs)
	if err != nil {
		return err
	}

	flavor := strings.ToLower(strings.TrimSpace(req.GPUFlavor))
	switch flavor {
	case "rocm":
		_, reason := dockerROCmSupport()
		return fmt.Errorf("gpuFlavor \"rocm\" is not available: %s", reason)
	case "", "none", "nvidia":
		// fall through
	default:
		return errors.New(`gpuFlavor must be one of "nvidia", "none"`)
	}

	manager := getDockerManager()
	manager.mu.Lock()
	manager.loadLocked()
	cached := manager.lastProbe
	manager.mu.Unlock()

	useGPU := false
	action := "created-cpu-only"
	var gpuInfo *GPUCapability
	var warning string
	if flavor == "nvidia" {
		gpuInfo = cached
		if cached != nil && cached.Verdict == "gpu-available" && time.Since(cached.CheckedAt) < 30*time.Minute {
			useGPU = true
			action = "created-gpu"
		} else {
			warning = "GPU was requested but the last GPU probe (or no probe at all) did not confirm availability, so this container is being created CPU-only. Run POST /api/v1/docker/probe-gpu first, then re-create with GPU."
		}
	}

	args := buildContainerRunArgs(imageRef, restartPolicy, hostPort, memoryGB, cpus, useGPU)
	preview := dockerCommandPreview(execPath, args)

	ctx, cancel := context.WithTimeout(r.Context(), dockerCreateTimeout)
	defer cancel()
	out, runErr := exec.CommandContext(ctx, execPath, args...).CombinedOutput()
	if runErr != nil {
		return dockerCommandError("docker run", out, runErr)
	}

	running := waitForContainerRunning(context.Background(), execPath, dockerContainerName, 10*time.Second)
	record := ContainerRecord{
		Name: dockerContainerName, Image: imageRef, HostPort: hostPort,
		RestartPolicy: restartPolicy, MemoryGB: memoryGB, CPUs: cpus,
		GPURequested: useGPU, CreatedAt: time.Now(),
	}
	if running {
		record.State = "running"
	}

	if useGPU && running {
		confirmCtx, confirmCancel := context.WithTimeout(context.Background(), dockerCommandTimeout)
		detail, confirmErr := execInContainer(confirmCtx, execPath, dockerContainerName, "ls /dev/dri /proc/driver/nvidia 2>&1")
		confirmCancel()
		devices := parseProbeDevices(detail)
		confirmed := confirmErr == nil && len(devices) > 0
		record.GPUAttached = confirmed

		manager.mu.Lock()
		manager.gpuConfirm = &gpuConfirmation{
			Requested: true, Confirmed: confirmed, Detail: redactText(detail),
			CheckedAt: time.Now(), Mismatch: !confirmed,
		}
		_ = manager.persistLocked()
		manager.mu.Unlock()

		if !confirmed {
			warning = "Container was created with --gpus all, but no NVIDIA devices are visible inside it after start; it is currently running CPU-only despite the GPU flag. Check the host driver and the NVIDIA Container Toolkit."
		}
	}

	resp := ContainerCreateResponse{Container: record, Action: action, GPU: gpuInfo, CommandPreview: preview, Warning: warning}
	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(resp)
}

func (s *Server) dockerContainerStart(w http.ResponseWriter, r *http.Request) error {
	return s.dockerContainerAction(w, r, "start", dockerCommandTimeout, nil)
}

func (s *Server) dockerContainerStop(w http.ResponseWriter, r *http.Request) error {
	return s.dockerContainerAction(w, r, "stop", dockerStopTimeout, []string{"-t", "15"})
}

func (s *Server) dockerContainerRestart(w http.ResponseWriter, r *http.Request) error {
	return s.dockerContainerAction(w, r, "restart", dockerStopTimeout, []string{"-t", "15"})
}

func (s *Server) dockerContainerAction(w http.ResponseWriter, r *http.Request, action string, timeout time.Duration, extraArgs []string) error {
	if r.Method != http.MethodPost {
		return errors.New("method not allowed")
	}
	execPath, err := resolveDockerExecutable()
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(r.Context(), timeout)
	defer cancel()
	args := append([]string{action}, extraArgs...)
	args = append(args, dockerContainerName)
	out, runErr := exec.CommandContext(ctx, execPath, args...).CombinedOutput()
	if runErr != nil {
		return dockerCommandError("docker "+action, out, runErr)
	}
	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(map[string]string{"action": action, "container": dockerContainerName})
}

type dockerDeleteRequest struct {
	Confirm string `json:"confirm"`
}

// dockerContainerDelete removes the container only, never the named
// volume -- that is the whole point of the volume: pulled model weights
// survive "docker rm". Volume deletion is a deliberately separate,
// separately-confirmed action and is not one of the routes this lane
// registers; see this lane's report for why.
func (s *Server) dockerContainerDelete(w http.ResponseWriter, r *http.Request) error {
	if r.Method != http.MethodDelete {
		return errors.New("method not allowed")
	}
	var req dockerDeleteRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 8*1024)).Decode(&req); err != nil {
		return fmt.Errorf("invalid delete request: %w", err)
	}
	if req.Confirm != "REMOVE" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		return json.NewEncoder(w).Encode(map[string]string{"error": `confirm must be exactly "REMOVE"`})
	}

	execPath, err := resolveDockerExecutable()
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(r.Context(), dockerCommandTimeout)
	defer cancel()
	out, runErr := exec.CommandContext(ctx, execPath, "rm", "-f", dockerContainerName).CombinedOutput()
	if runErr != nil {
		return dockerCommandError("docker rm", out, runErr)
	}

	manager := getDockerManager()
	manager.mu.Lock()
	manager.gpuConfirm = nil
	_ = manager.persistLocked()
	manager.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(map[string]string{"removed": dockerContainerName})
}

func (s *Server) dockerContainerLogs(w http.ResponseWriter, r *http.Request) error {
	execPath, err := resolveDockerExecutable()
	if err != nil {
		return err
	}
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	cmd := exec.CommandContext(ctx, execPath, "logs", "-f", "--tail", "200", "--timestamps", dockerContainerName)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("docker logs: %w", err)
	}
	defer cmd.Wait()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	flusher, ok := w.(http.Flusher)
	if !ok {
		return errors.New("streaming is not supported")
	}

	lines := make(chan string, 64)
	var wg sync.WaitGroup
	pump := func(reader io.Reader) {
		defer wg.Done()
		scanner := bufio.NewScanner(reader)
		scanner.Buffer(make([]byte, 4096), 256*1024)
		for scanner.Scan() {
			select {
			case lines <- redactText(scanner.Text()):
			case <-ctx.Done():
				return
			}
		}
	}
	wg.Add(2)
	go pump(stdout)
	go pump(stderr)
	go func() { wg.Wait(); close(lines) }()

	for {
		select {
		case line, ok := <-lines:
			if !ok {
				return nil
			}
			payload, _ := json.Marshal(map[string]string{"line": line})
			fmt.Fprintf(w, "event: log\ndata: %s\n\n", payload)
			flusher.Flush()
		case <-r.Context().Done():
			return nil
		}
	}
}

func (s *Server) dockerContainerHealth(w http.ResponseWriter, r *http.Request) error {
	execPath, err := resolveDockerExecutable()
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(r.Context(), dockerCommandTimeout)
	state, inspectErr := dockerInspectContainer(ctx, execPath, dockerContainerName)
	cancel()

	health := ContainerHealth{CheckedAt: time.Now()}
	w.Header().Set("Content-Type", "application/json")
	if inspectErr != nil {
		health.ContainerState = "not-found"
		return json.NewEncoder(w).Encode(health)
	}
	health.ContainerState = state.State.Status

	hostPort := 0
	if bindings, ok := state.NetworkSettings.Ports["11434/tcp"]; ok && len(bindings) > 0 {
		hostPort, _ = strconv.Atoi(bindings[0].HostPort)
	}

	switch {
	case !state.State.Running:
		health.APIDetail = "container is not running"
	case hostPort == 0:
		health.APIDetail = "no published host port was found"
	default:
		client := &http.Client{Timeout: 3 * time.Second}
		resp, getErr := client.Get(fmt.Sprintf("http://127.0.0.1:%d/api/version", hostPort))
		if getErr != nil {
			health.APIDetail = "not responding yet: " + redactText(getErr.Error())
		} else {
			defer resp.Body.Close()
			body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
			if resp.StatusCode == http.StatusOK {
				var payload struct {
					Version string `json:"version"`
				}
				_ = json.Unmarshal(body, &payload)
				health.APIHealthy = true
				health.APIVersion = payload.Version
			} else {
				health.APIDetail = fmt.Sprintf("unexpected status %d from /api/version", resp.StatusCode)
			}
		}
	}
	return json.NewEncoder(w).Encode(health)
}
