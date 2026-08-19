//go:build windows || darwin

package ui

import (
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
	"strings"
	"time"

	"github.com/ollama/ollama/cmd/launch"
)

// launchSpawnTimeout bounds only the "did a new terminal actually open"
// confirmation below -- never the integration session itself, which is
// meant to keep running as the user's own long-lived terminal session long
// after this HTTP handler returns. Mirrors codexCommandTimeout's role in
// codex.go for a short, bounded local process check.
const launchSpawnTimeout = 10 * time.Second

var launchSlugRE = regexp.MustCompile(`^[a-z][a-z0-9-]{0,63}$`)

// guiLaunchableHomeViews reconciles two sources of truth that disagree:
//
//   - cmd/launch's registry (cmd/launch/registry.go) is authoritative for
//     which integrations EXIST, their display name/description, and how to
//     detect whether each one's binary is installed. It currently registers
//     15 visible (non-hidden) integrations: claude, cline, codex, chatgpt
//     (aliases codex-app/codex-desktop/codex-gui), copilot, droid,
//     dsh/deepseek-harness, opencode, omp, openclaw, pi, pool, hermes,
//     hermes-desktop and qwen.
//   - app/store/database.go's setSettings has its own `validLaunchView`
//     allow-list of `last_home_view` slugs it will actually persist:
//     launch, openclaw, claude, hermes, codex, codex-app, copilot,
//     opencode, droid, pi. Anything outside that list silently falls back
//     to "launch" the next time settings are saved.
//
// Offering a card (or, worse, a working Launch button) for an integration
// the rest of the app cannot even remember as the last-used view would be
// exactly the kind of "looks live, does something the app then forgets"
// half-feature this project forbids. Per the lane brief, this file treats
// database.go's list as the narrower, authoritative allow-list and offers
// only the intersection: cline, dsh/deepseek-harness, omp, pool,
// hermes-desktop and qwen are real, installable, registry-visible
// integrations that this screen deliberately does NOT show or allow
// /api/v1/launch/run to launch.
//
// Keyed by every registry spelling (canonical name and alias) that
// database.go's list accepts, mapping to the exact string setSettings will
// persist -- notably "codex-app", not the registry's canonical "chatgpt",
// since that is the only spelling database.go's allow-list actually
// contains. There is no single shared Go value to import instead: app/store
// intentionally does not depend on app/ui (or vice versa) to avoid an
// import cycle, so this map is kept in sync by hand.
var guiLaunchableHomeViews = map[string]string{
	"openclaw":  "openclaw",
	"claude":    "claude",
	"hermes":    "hermes",
	"codex":     "codex",
	"codex-app": "codex-app",
	"chatgpt":   "codex-app",
	"copilot":   "copilot",
	"opencode":  "opencode",
	"droid":     "droid",
	"pi":        "pi",
}

// LaunchIntegrationInfo is what the Launch screen shows for one integration
// card. ID is always the registry's canonical name (never an alias);
// HomeView is the exact value the desktop GUI persists as last_home_view
// when this integration is launched, which is spelled differently for the
// "chatgpt" entry -- see guiLaunchableHomeViews.
type LaunchIntegrationInfo struct {
	ID            string `json:"id"`
	HomeView      string `json:"homeView"`
	Name          string `json:"name"`
	Description   string `json:"description"`
	Command       string `json:"command"`
	Installed     bool   `json:"installed"`
	MissingBinary string `json:"missingBinary,omitempty"`
	InstallHint   string `json:"installHint,omitempty"`
}

// resolveGUIHomeView returns the persisted last_home_view spelling for a
// registry spec, and whether the desktop GUI is allowed to show/launch it
// at all, checking the canonical name first and then every alias.
func resolveGUIHomeView(spec *launch.IntegrationSpec) (string, bool) {
	if homeView, ok := guiLaunchableHomeViews[spec.Name]; ok {
		return homeView, true
	}
	for _, alias := range spec.Aliases {
		if homeView, ok := guiLaunchableHomeViews[alias]; ok {
			return homeView, true
		}
	}
	return "", false
}

// listGUILaunchableIntegrations enumerates the registry, in the registry's
// own launcher display order, filtered down to guiLaunchableHomeViews.
func listGUILaunchableIntegrations() []LaunchIntegrationInfo {
	visible := launch.ListVisibleIntegrationSpecs()
	out := make([]LaunchIntegrationInfo, 0, len(guiLaunchableHomeViews))
	for i := range visible {
		spec := &visible[i]
		homeView, ok := resolveGUIHomeView(spec)
		if !ok {
			continue
		}

		installed := true
		if spec.Install.CheckInstalled != nil {
			installed = spec.Install.CheckInstalled()
		}

		info := LaunchIntegrationInfo{
			ID:          spec.Name,
			HomeView:    homeView,
			Name:        spec.Runner.String(),
			Description: spec.Description,
			Command:     "ollama launch " + spec.Name,
			Installed:   installed,
		}
		if !installed {
			// Name the exact missing binary rather than leaving the
			// disabled Launch button unexplained -- for every registry
			// entry the desktop GUI offers, the CLI token IS the binary
			// name a user would type on a shell (codex, droid, pi, cline,
			// hermes, opencode, openclaw, copilot, claude).
			info.MissingBinary = spec.Name
			switch {
			case spec.Install.URL != "":
				info.InstallHint = "Install from " + spec.Install.URL
			case len(spec.Install.Command) > 0:
				info.InstallHint = "Install with: " + strings.Join(spec.Install.Command, " ")
			}
		}
		out = append(out, info)
	}
	return out
}

func (s *Server) launchIntegrations(w http.ResponseWriter, r *http.Request) error {
	if r.Method != http.MethodGet {
		return errors.New("method not allowed")
	}
	return json.NewEncoder(w).Encode(map[string]any{"integrations": listGUILaunchableIntegrations()})
}

type launchRunRequest struct {
	Integration string `json:"integration"`
}

type launchRunResponse struct {
	Integration string `json:"integration"`
	HomeView    string `json:"homeView"`
	Command     string `json:"command"`
	Launched    bool   `json:"launched"`
}

func (s *Server) launchRun(w http.ResponseWriter, r *http.Request) error {
	if r.Method != http.MethodPost {
		return errors.New("method not allowed")
	}

	var request launchRunRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 4*1024)).Decode(&request); err != nil {
		return fmt.Errorf("invalid launch request: %w", err)
	}

	slug := strings.ToLower(strings.TrimSpace(request.Integration))
	if !launchSlugRE.MatchString(slug) {
		return errors.New("integration is required and must be a single lowercase slug")
	}

	// Validate against the registry FIRST (resolves aliases like
	// "codex-app" to their canonical spec), then re-run the exact
	// allow-list check GET /api/v1/launch/integrations applies. This keeps
	// the run endpoint from ever being able to launch something the card
	// list would not have offered in the first place.
	spec, err := launch.LookupIntegrationSpec(slug)
	if err != nil {
		return fmt.Errorf("unknown integration: %s", slug)
	}
	homeView, ok := resolveGUIHomeView(spec)
	if !ok {
		return fmt.Errorf("%s cannot be launched from the desktop app", spec.Name)
	}

	if spec.Install.CheckInstalled != nil && !spec.Install.CheckInstalled() {
		return fmt.Errorf("%s is not installed -- the %q binary was not found", spec.Runner.String(), spec.Name)
	}

	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("resolve the ollama executable: %w", err)
	}
	exePath, err = filepath.Abs(exePath)
	if err != nil {
		return fmt.Errorf("resolve the ollama executable: %w", err)
	}
	if _, err := os.Stat(exePath); err != nil {
		return fmt.Errorf("ollama executable is not accessible: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), launchSpawnTimeout)
	defer cancel()
	if err := spawnLaunchTerminal(ctx, exePath, spec.Name); err != nil {
		return fmt.Errorf("launch %s: %w", spec.Runner.String(), err)
	}

	return json.NewEncoder(w).Encode(launchRunResponse{
		Integration: spec.Name,
		HomeView:    homeView,
		Command:     "ollama launch " + spec.Name,
		Launched:    true,
	})
}

// spawnLaunchTerminal opens a new interactive terminal running exactly the
// command every launch card shows in mono type: "ollama launch <slug>".
// exec.CommandContext with argv tokens throughout -- never a shell string
// built from user input -- and slug always comes from a successful
// launch.LookupIntegrationSpec() lookup above, so it is always one of the
// registry's own canonical names.
//
// This genuinely needs a real terminal attached to the child, not a pipe
// this HTTP handler could read from: every Runner.Run implementation in
// cmd/launch (see cmd/launch/claude.go, codex.go, ...) inherits
// os.Stdin/Stdout/Stderr from its own process and blocks for the life of
// the interactive session. Spawning "ollama launch <slug>" directly from
// this console-less background server, with no console of its own to
// inherit, would hand that session no terminal at all -- so on Windows this
// goes through cmd.exe's "start" builtin (the same mechanism Explorer's Run
// box and shortcuts use) specifically because it knows how to allocate a
// fresh, visible console for its child regardless of the caller's own
// console state. The bounded ctx here covers only that confirmation step;
// it is never applied to the spawned session itself.
func spawnLaunchTerminal(ctx context.Context, exePath, slug string) error {
	switch runtime.GOOS {
	case "windows":
		// "start" always treats its first quoted argument as the window
		// title -- give it an explicit one (Go will quote it for us, since
		// it contains a space) so an exePath that itself needs quoting can
		// never be mistaken for the title, which is the classic way this
		// invocation silently launches nothing.
		cmd := exec.CommandContext(ctx, "cmd.exe", "/c", "start", "Ollama Launch: "+slug, exePath, "launch", slug)
		return cmd.Run()
	case "darwin":
		script := fmt.Sprintf(`tell application "Terminal" to do script %s`,
			appleScriptQuote(shellQuoteSingle(exePath)+" launch "+slug))
		cmd := exec.CommandContext(ctx, "osascript", "-e", script)
		return cmd.Run()
	default:
		return fmt.Errorf("launching an integration from the desktop app is not supported on %s", runtime.GOOS)
	}
}

// shellQuoteSingle wraps a value in POSIX single quotes for the shell
// Terminal.app's "do script" will run the command through, so a path
// containing a space (common under /Applications on macOS) is not split
// into multiple tokens.
func shellQuoteSingle(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

// appleScriptQuote wraps a value in a double-quoted AppleScript string
// literal, escaping the two characters that string syntax treats specially.
func appleScriptQuote(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `"`, `\"`)
	return `"` + s + `"`
}
