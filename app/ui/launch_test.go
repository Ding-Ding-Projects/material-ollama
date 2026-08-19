//go:build windows || darwin

package ui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/ollama/ollama/cmd/launch"
)

// --- harness-launch: launch.go's allow-list and validation contract -----
//
// This deliberately never exercises spawnLaunchTerminal or the
// spec.Install.CheckInstalled()==true success branch of launchRun: on
// Windows that path shells out to `cmd.exe /c start ...`, which opens a
// real, visible console window on whatever desktop this test process
// happens to run on -- exactly the side effect a headless CI/test run must
// never cause. What IS exercised for real is every validation and
// allow-list decision launchRun makes before it would ever reach that
// point: HTTP method gating, slug syntax, registry lookup, and -- the
// contract this file's own header comment names as the whole reason this
// screen exists -- the deliberate narrowing to the intersection of
// cmd/launch's registry and database.go's persisted last_home_view
// allow-list, proven against "cline", a real registered integration this
// screen must refuse to launch.

// TestLaunchIntegrations_OnlyListsTheAllowedIntersection proves
// listGUILaunchableIntegrations (served by GET /api/v1/launch/integrations)
// only ever returns entries whose HomeView is one of the values
// guiLaunchableHomeViews actually maps to -- so an integration the
// registry knows about but the GUI intersection excludes (per this file's
// own extensive header comment: cline, dsh/deepseek-harness, omp, pool,
// hermes-desktop, qwen) can never appear as an offered card.
func TestLaunchIntegrations_OnlyListsTheAllowedIntersection(t *testing.T) {
	s := &Server{}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/launch/integrations", nil)
	rec := httptest.NewRecorder()

	if err := s.launchIntegrations(rec, req); err != nil {
		t.Fatalf("launchIntegrations: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	var body struct {
		Integrations []LaunchIntegrationInfo `json:"integrations"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(body.Integrations) == 0 {
		t.Fatal("Integrations is empty, want at least the known always-visible entries (claude, codex, ...)")
	}

	allowedHomeViews := make(map[string]bool, len(guiLaunchableHomeViews))
	for _, hv := range guiLaunchableHomeViews {
		allowedHomeViews[hv] = true
	}

	excluded := map[string]bool{"cline": true, "dsh": true, "deepseek-harness": true, "omp": true, "pool": true, "hermes-desktop": true, "qwen": true}

	for _, info := range body.Integrations {
		if !allowedHomeViews[info.HomeView] {
			t.Fatalf("integration %q has HomeView %q, which is not in guiLaunchableHomeViews -- listGUILaunchableIntegrations must never offer a card database.go cannot persist as last_home_view", info.ID, info.HomeView)
		}
		if excluded[info.ID] {
			t.Fatalf("integration %q was listed, but this lane's spec says it must be deliberately excluded from the desktop GUI", info.ID)
		}
		if info.Command != "ollama launch "+info.ID {
			t.Fatalf("integration %q Command = %q, want %q", info.ID, info.Command, "ollama launch "+info.ID)
		}
	}
}

// TestLaunchRun_RejectsWrongMethod proves launchRun refuses anything but
// POST, before it ever touches the request body or the registry.
func TestLaunchRun_RejectsWrongMethod(t *testing.T) {
	s := &Server{}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/launch/run", nil)
	rec := httptest.NewRecorder()

	err := s.launchRun(rec, req)
	if err == nil {
		t.Fatal("launchRun accepted a GET request")
	}
	if !strings.Contains(err.Error(), "method not allowed") {
		t.Fatalf("error = %q, want it to mention method not allowed", err.Error())
	}
}

// TestLaunchRun_RejectsMalformedSlug proves launchSlugRE's syntax gate
// fires before any registry lookup for input that could never be a valid
// integration slug -- whitespace, empty, a value starting with a digit,
// and values carrying path/shell metacharacters that must never reach
// exec.CommandContext's argv even indirectly.
//
// Deliberately NOT covered here: mixed-case input such as "Codex". Reading
// launchRun shows `slug := strings.ToLower(strings.TrimSpace(...))` runs
// BEFORE the regex check, so "Codex" is normalized to the real, allowed,
// registry-resolvable "codex" integration and is not actually malformed by
// the time launchSlugRE sees it -- asserting rejection there would be
// asserting something false about the real code, and reaching that branch
// in a test risks the real spawnLaunchTerminal path (a visible
// `cmd.exe /c start` launch) if a "codex" binary happens to be on this
// machine's PATH, which is exactly the side effect a headless test run
// must never risk causing.
func TestLaunchRun_RejectsMalformedSlug(t *testing.T) {
	cases := []string{"", "   ", "codex tool", "../../etc/passwd", "codex; rm -rf /", "codex&whoami", "1codex", "-codex"}
	for _, slug := range cases {
		t.Run(slug, func(t *testing.T) {
			s := &Server{}
			body := strings.NewReader(`{"integration":"` + strings.ReplaceAll(slug, `"`, `\"`) + `"}`)
			req := httptest.NewRequest(http.MethodPost, "/api/v1/launch/run", body)
			rec := httptest.NewRecorder()

			err := s.launchRun(rec, req)
			if err == nil {
				t.Fatalf("launchRun accepted invalid slug %q", slug)
			}
		})
	}
}

// TestLaunchRun_RejectsUnknownIntegration proves a syntactically valid
// slug that the registry has simply never heard of is rejected with an
// "unknown integration" error, never silently falling through toward a
// spawn attempt.
func TestLaunchRun_RejectsUnknownIntegration(t *testing.T) {
	s := &Server{}
	body := strings.NewReader(`{"integration":"totally-unregistered-tool"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/launch/run", body)
	rec := httptest.NewRecorder()

	err := s.launchRun(rec, req)
	if err == nil {
		t.Fatal("launchRun accepted an integration the registry does not know")
	}
	if !strings.Contains(err.Error(), "unknown integration") {
		t.Fatalf("error = %q, want it to say unknown integration", err.Error())
	}
}

// TestLaunchRun_RejectsRegisteredIntegrationOutsideGUIAllowList is the
// exact contract this lane's brief names for "harness-launch": a real,
// installable, registry-visible integration ("cline") that this screen
// deliberately does not offer must be refused by /api/v1/launch/run too
// -- not just omitted from the card list -- so the run endpoint can never
// launch something the card list would not have shown in the first place.
// This also proves launch.LookupIntegrationSpec("cline") really does
// resolve (i.e. this is testing the allow-list check, not a registry
// miss) before asserting on the specific rejection reason.
func TestLaunchRun_RejectsRegisteredIntegrationOutsideGUIAllowList(t *testing.T) {
	spec, err := launch.LookupIntegrationSpec("cline")
	if err != nil {
		t.Skipf("cmd/launch registry no longer registers %q (%v); this test's premise no longer holds", "cline", err)
	}
	if _, ok := resolveGUIHomeView(spec); ok {
		t.Skip("cline is now in guiLaunchableHomeViews; this negative-path test no longer applies -- update it alongside that map")
	}

	s := &Server{}
	body := strings.NewReader(`{"integration":"cline"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/launch/run", body)
	rec := httptest.NewRecorder()

	err = s.launchRun(rec, req)
	if err == nil {
		t.Fatal("launchRun launched (or claimed to launch) an integration outside the GUI allow-list")
	}
	if !strings.Contains(err.Error(), "cannot be launched from the desktop app") {
		t.Fatalf("error = %q, want it to say the integration cannot be launched from the desktop app", err.Error())
	}
}

// TestResolveGUIHomeView_ResolvesCanonicalAndAlias proves
// resolveGUIHomeView checks both a spec's canonical registry name and its
// aliases -- the exact mechanism that lets "chatgpt" (an alias) resolve to
// the "codex-app" HomeView database.go's allow-list actually contains, per
// this file's own extensive header comment.
func TestResolveGUIHomeView_ResolvesCanonicalAndAlias(t *testing.T) {
	spec, err := launch.LookupIntegrationSpec("chatgpt")
	if err != nil {
		t.Fatalf("LookupIntegrationSpec(chatgpt): %v", err)
	}
	homeView, ok := resolveGUIHomeView(spec)
	if !ok {
		t.Fatalf("resolveGUIHomeView(%q spec) ok = false, want true", spec.Name)
	}
	if homeView != "codex-app" {
		t.Fatalf("homeView = %q, want %q (the one spelling database.go's allow-list actually contains)", homeView, "codex-app")
	}
}
