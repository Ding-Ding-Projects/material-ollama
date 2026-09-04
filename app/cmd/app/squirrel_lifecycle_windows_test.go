//go:build windows

package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
	"time"
)

// The subprocess is this test executable, never a real installer or Update.exe.
// It records the real CreateProcess argument boundary without modifying the host.
func TestMain(m *testing.M) {
	if strings.EqualFold(filepath.Base(os.Args[0]), "lifecycle-helper.exe") && os.Getenv("OLLAMA_LIFECYCLE_TEST_HELPER") != "" {
		switch os.Getenv("OLLAMA_LIFECYCLE_TEST_HELPER") {
		case "wait":
			time.Sleep(30 * time.Second)
		case "exit":
			os.Exit(7)
		case "record":
			data, _ := json.Marshal(os.Args[1:])
			if os.WriteFile(filepath.Join(filepath.Dir(os.Args[0]), "observed.json"), data, 0o600) != nil {
				os.Exit(8)
			}
		}
		os.Exit(0)
	}
	os.Exit(m.Run())
}

func copyLifecycleFixture(t *testing.T, path string) string {
	t.Helper()
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	source, err := os.Open(executable)
	if err != nil {
		t.Fatal(err)
	}
	defer source.Close()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	target, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	hash := sha256.New()
	if _, err := io.Copy(io.MultiWriter(target, hash), source); err != nil {
		t.Fatal(err)
	}
	if err := target.Close(); err != nil {
		t.Fatal(err)
	}
	return hex.EncodeToString(hash.Sum(nil))
}

func TestSquirrelLifecycleExactCallbacks(t *testing.T) {
	root := filepath.Join(t.TempDir(), map[string]string{"amd64": "MaterialOllamaX64", "arm64": "MaterialOllamaArm64"}[runtime.GOARCH])
	update := filepath.Join(root, "Update.exe")
	copyLifecycleFixture(t, update)
	// Go's test executable has no asInvoker manifest. Naming those bytes
	// Update.exe triggers Windows' legacy installer-detection elevation heuristic.
	// Check the exact production target, then run identical fixture bytes through
	// a neutral filename. This is process-boundary evidence, not Squirrel proof.
	helper := filepath.Join(root, "lifecycle-helper.exe")
	if err := os.Link(update, helper); err != nil {
		t.Fatal(err)
	}
	executable := func() (string, error) { return filepath.Join(root, "app-1.2.3", squirrelEntryPoint), nil }
	for _, test := range []struct{ flag, action string }{
		{"--squirrel-install", "--createShortcut=" + squirrelEntryPoint},
		{"--squirrel-updated", "--createShortcut=" + squirrelEntryPoint},
		{"--squirrel-uninstall", "--removeShortcut=" + squirrelEntryPoint},
	} {
		t.Run(test.flag, func(t *testing.T) {
			t.Setenv("OLLAMA_LIFECYCLE_TEST_HELPER", "record")
			handled, err := runSquirrelLifecycle([]string{test.flag, "1.2.3"}, executable, func(ctx context.Context, target string, args ...string) error {
				if target != update {
					t.Fatalf("wrong updater target: %s", target)
				}
				return runLifecycleProcess(ctx, helper, args...)
			})
			if !handled || err != nil {
				t.Fatalf("handled=%v error=%v", handled, err)
			}
			data, err := os.ReadFile(filepath.Join(root, "observed.json"))
			if err != nil {
				t.Fatal(err)
			}
			var args []string
			if err := json.Unmarshal(data, &args); err != nil {
				t.Fatal(err)
			}
			if want := []string{test.action, "--shortcut-locations=Desktop,StartMenu"}; !reflect.DeepEqual(args, want) {
				t.Fatalf("args=%q want=%q", args, want)
			}
		})
	}
}

func TestSquirrelLifecycleDoesNotStartNormalWork(t *testing.T) {
	for _, test := range []struct {
		args               []string
		handled, wantError bool
	}{
		{nil, false, false},
		{[]string{"--version"}, false, false},
		{[]string{"--squirrel-firstrun"}, false, false},
		{[]string{"--squirrel-obsolete", "1.2.3"}, true, false},
		{[]string{"--squirrel-obsolete"}, true, true},
		{[]string{"--squirrel-obsolete", "1.2.3", "--route", "/"}, true, true},
		{[]string{"--squirrel-install", "../1.2.3"}, true, true},
		{[]string{"--squirrel-updated", "1.2.3;calc"}, true, true},
		{[]string{"--squirrel-unknown", "1.2.3"}, true, true},
		{[]string{"--squirrel-firstrun", "extra"}, true, true},
	} {
		t.Run(strings.Join(test.args, "_"), func(t *testing.T) {
			unexpected := func() (string, error) { t.Fatal("executable lookup must not run"); return "", nil }
			run := func(context.Context, string, ...string) error { t.Fatal("process must not run"); return nil }
			handled, err := runSquirrelLifecycle(test.args, unexpected, run)
			if handled != test.handled || (err != nil) != test.wantError {
				t.Fatalf("handled=%v error=%v", handled, err)
			}
		})
	}
}

func TestSquirrelLifecycleRejectsWrongLayoutAndMissingUpdater(t *testing.T) {
	for _, path := range []string{"ollama app.exe", filepath.Join(t.TempDir(), "OtherApp", "app-1.2.3", squirrelEntryPoint), filepath.Join(t.TempDir(), "MaterialOllamaX64", "app-9.9.9", squirrelEntryPoint), filepath.Join(t.TempDir(), "MaterialOllamaX64", "app-1.2.3", squirrelEntryPoint)} {
		handled, err := runSquirrelLifecycle([]string{"--squirrel-install", "1.2.3"}, func() (string, error) { return path, nil }, func(context.Context, string, ...string) error { t.Fatal("must not launch"); return nil })
		if !handled || err == nil {
			t.Fatalf("accepted %s", path)
		}
	}
}

func TestLifecycleProcessDeadlineAndRedactedExit(t *testing.T) {
	path := filepath.Join(t.TempDir(), "lifecycle-helper.exe")
	copyLifecycleFixture(t, path)
	t.Setenv("OLLAMA_LIFECYCLE_TEST_HELPER", "wait")
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	start := time.Now()
	if err := runLifecycleProcess(ctx, path); err == nil || !strings.Contains(err.Error(), "deadline") {
		t.Fatalf("error=%v", err)
	}
	if time.Since(start) > 5*time.Second {
		t.Fatal("deadline did not bound process")
	}
	t.Setenv("OLLAMA_LIFECYCLE_TEST_HELPER", "exit")
	if err := runLifecycleProcess(context.Background(), path); err == nil || err.Error() != "process exit code 7" {
		t.Fatalf("error=%v", err)
	}
}

func TestWebView2PinsMatchBuildManifest(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "scripts", "release-dependencies.json"))
	if err != nil {
		t.Fatal(err)
	}
	var manifest struct {
		WebView2 []struct{ Architecture, Filename, SHA256, Version string }
	}
	if err := json.Unmarshal(data, &manifest); err != nil {
		t.Fatal(err)
	}
	if len(manifest.WebView2) != 2 || len(bundledWebView2Installers) != 2 {
		t.Fatal("expected both architectures")
	}
	for _, item := range manifest.WebView2 {
		arch := map[string]string{"x64": "amd64", "arm64": "arm64"}[item.Architecture]
		spec, ok := bundledWebView2Installers[arch]
		if !ok || spec.filename != item.Filename || spec.sha256 != item.SHA256 || webView2MinimumVersion != item.Version {
			t.Fatalf("runtime pins drifted for %s", item.Architecture)
		}
	}
}

func TestWebView2VerifiedFileAndReplacementProtection(t *testing.T) {
	path := filepath.Join(t.TempDir(), "installer.exe")
	digest := copyLifecycleFixture(t, path)
	if file, err := openVerifiedWebView2(path, strings.Repeat("0", 64)); err == nil {
		file.Close()
		t.Fatal("accepted altered digest")
	}
	file, err := openVerifiedWebView2(path, digest)
	if err != nil {
		t.Fatal(err)
	}
	if writer, err := os.OpenFile(path, os.O_WRONLY, 0); err == nil {
		writer.Close()
		file.Close()
		t.Fatal("installer bytes could change after verification")
	}
	if err := os.Remove(path); err == nil {
		file.Close()
		t.Fatal("installer could be deleted after verification")
	}
	file.Close()
	if err := os.WriteFile(path, []byte("MZ corrupt"), 0o600); err != nil {
		t.Fatal(err)
	}
	if file, err := openVerifiedWebView2(path, digest); err == nil {
		file.Close()
		t.Fatal("accepted corrupt executable")
	}
}

func TestWebView2ReadinessAndInstallation(t *testing.T) {
	t.Run("already compatible", func(t *testing.T) {
		err := ensureWebView2(context.Background(), t.TempDir(), runtime.GOARCH, func(string) bool { return true }, func(context.Context, string, ...string) error { t.Fatal("must not install"); return nil })
		if err != nil {
			t.Fatal(err)
		}
	})
	t.Run("missing bundle fails closed", func(t *testing.T) {
		err := ensureWebView2(context.Background(), t.TempDir(), runtime.GOARCH, func(string) bool { return false }, func(context.Context, string, ...string) error { t.Fatal("must not run"); return nil })
		if err == nil {
			t.Fatal("missing bundle accepted")
		}
	})
	for _, outcome := range []string{"ready", "not-ready", "exit", "cancel"} {
		t.Run(outcome, func(t *testing.T) {
			dir := t.TempDir()
			original := bundledWebView2Installers[runtime.GOARCH]
			path := filepath.Join(dir, "webview2", original.filename)
			digest := copyLifecycleFixture(t, path)
			bundledWebView2Installers[runtime.GOARCH] = bundledWebView2{original.filename, digest}
			t.Cleanup(func() { bundledWebView2Installers[runtime.GOARCH] = original })
			calls := 0
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			err := ensureWebView2(ctx, dir, runtime.GOARCH, func(string) bool { calls++; return calls > 1 && outcome == "ready" }, func(ctx context.Context, exe string, args ...string) error {
				if exe != path || !reflect.DeepEqual(args, []string{"/silent", "/install"}) {
					t.Fatalf("wrong command %s %q", exe, args)
				}
				if _, ok := ctx.Deadline(); !ok {
					t.Fatal("missing deadline")
				}
				if outcome == "cancel" {
					cancel()
				}
				if outcome == "exit" {
					return errors.New("process exit code 7")
				}
				return nil
			})
			if (err == nil) != (outcome == "ready") {
				t.Fatalf("outcome %s error=%v", outcome, err)
			}
		})
	}
}

func TestWebView2ActualRuntimeFiles(t *testing.T) {
	dir := filepath.Join(t.TempDir(), webView2MinimumVersion)
	folder := map[string]string{"amd64": "x64", "arm64": "arm64"}[runtime.GOARCH]
	path := filepath.Join(dir, "EBWebView", folder, "EmbeddedBrowserWebView.dll")
	if webView2FilesReady(dir, webView2MinimumVersion, runtime.GOARCH) {
		t.Fatal("registry alone must not prove runtime")
	}
	copyLifecycleFixture(t, path)
	if !webView2FilesReady(dir, webView2MinimumVersion, runtime.GOARCH) {
		t.Fatal("expected actual architecture PE fixture")
	}
	if webView2FilesReady(dir, "100.0.0.0", runtime.GOARCH) {
		t.Fatal("accepted old registered version")
	}
	if err := os.WriteFile(path, []byte("invalid DLL"), 0o600); err != nil {
		t.Fatal(err)
	}
	if webView2FilesReady(dir, webView2MinimumVersion, runtime.GOARCH) {
		t.Fatal("accepted broken DLL")
	}
}

func TestWebView2VersionValidation(t *testing.T) {
	for _, test := range []struct {
		value string
		want  bool
	}{
		{"151.0.4129.101", true}, {"151.0.4129.102", true}, {"152.0.0.0", true},
		{"151.0.4129.100", false}, {"150.99.9999.9999", false}, {"0.0.0.0", false},
		{"999.0.0.bad", false}, {"151.0.4129", false}, {"151.0.4129.101.1", false}, {"151.-1.4129.101", false},
	} {
		if got := webView2VersionAtLeast(test.value, webView2MinimumVersion); got != test.want {
			t.Fatalf("%s got %v", test.value, got)
		}
	}
}
