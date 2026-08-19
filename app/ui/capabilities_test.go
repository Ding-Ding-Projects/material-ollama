//go:build windows || darwin

package ui

import "testing"

// TestCommandGUIRoute_HiddenUnknownCommandGetsDeveloperPrefix is the exact
// case the CLI<->GUI parity contract depends on: an unrecognised command
// name falls through commandGUIRoute's switch to its default branch, and
// that branch must pick the "developer/commands/" prefix rather than the
// plain "commands/" prefix specifically because the command is hidden --
// this is what lets the Developer Tools panel's own "Hidden" badge and its
// distinct route prefix stay in sync with the real registry instead of
// merely being decorative UI. A regression here (e.g. dropping the
// hidden-vs-visible branch, or swapping which prefix wins) would silently
// misfile every hidden command's GUI route without any visible symptom
// short of this exact prefix.
func TestCommandGUIRoute_HiddenUnknownCommandGetsDeveloperPrefix(t *testing.T) {
	got := commandGUIRoute([]string{"ollama", "debugthing"}, true)
	want := "developer/commands/ollama/debugthing"
	if got != want {
		t.Fatalf("commandGUIRoute(hidden=true) = %q, want %q", got, want)
	}

	// The same unknown command, not hidden, must land on the plain prefix
	// instead -- proving the branch is actually conditioned on hidden and
	// not just always emitting "developer/commands/...".
	gotVisible := commandGUIRoute([]string{"ollama", "debugthing"}, false)
	wantVisible := "commands/ollama/debugthing"
	if gotVisible != wantVisible {
		t.Fatalf("commandGUIRoute(hidden=false) = %q, want %q", gotVisible, wantVisible)
	}
}

// TestCommandGUIRoute_KnownAliasesShareOneRoute proves the alias groups in
// commandGUIRoute's switch actually merge onto the single GUIRoute the
// Models screen renders a link to (isRoutedGuiRoute in the UI narrows
// "routed" to the exact "models" prefix) -- "list", "ls", and "ps" name
// three different Cobra subcommands but must all resolve to the same
// screen, and "pull"/"push" must resolve to the distinct transfer screen
// rather than colliding with it.
func TestCommandGUIRoute_KnownAliasesShareOneRoute(t *testing.T) {
	cases := []struct {
		leaf string
		want string
	}{
		{"list", "models"},
		{"ls", "models"},
		{"ps", "models"},
		{"pull", "models/transfer"},
		{"push", "models/transfer"},
		{"rm", "models/remove"},
	}
	for _, c := range cases {
		got := commandGUIRoute([]string{"ollama", c.leaf}, false)
		if got != c.want {
			t.Errorf("commandGUIRoute(%q) = %q, want %q", c.leaf, got, c.want)
		}
	}
}
