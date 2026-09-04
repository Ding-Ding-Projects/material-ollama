//go:build windows

package main

import (
	"context"
	"crypto/sha256"
	"debug/pe"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

const squirrelEntryPoint = "ollama app.exe"
const webView2MinimumVersion = "151.0.4129.101"
const webView2ClientKey = `Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}`
const webView2StateKey = `Software\Microsoft\EdgeUpdate\ClientState\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}`

type bundledWebView2 struct {
	filename string
	sha256   string
}

// These pins are compiled into the application. An adjacent writable manifest
// cannot authorize replacement bytes. The focused test compares both entries to
// the build's canonical release-dependencies.json.
var bundledWebView2Installers = map[string]bundledWebView2{
	"amd64": {"MicrosoftEdgeWebView2RuntimeInstallerX64.exe", "82b2d8a7013e0c0ea15d48ff4742ee3778ba16bd8b7b4a47876645b3e48d4016"},
	"arm64": {"MicrosoftEdgeWebView2RuntimeInstallerARM64.exe", "04e55e0e27c52aa05bf3856ffb968946665b0ef6fb4394a818e27eb526d0216e"},
}

// handleSquirrelLifecycle must be the first call in main, before argument
// parsing, logging setup, single-instance detection, UI or server startup.
// --squirrel-firstrun intentionally continues through normal startup.
func handleSquirrelLifecycle(args []string) (bool, error) {
	return runSquirrelLifecycle(args, os.Executable, runLifecycleProcess)
}

type lifecycleProcess func(context.Context, string, ...string) error

func runSquirrelLifecycle(args []string, executable func() (string, error), run lifecycleProcess) (bool, error) {
	if len(args) == 0 || !strings.HasPrefix(args[0], "--squirrel-") {
		return false, nil
	}
	if args[0] == "--squirrel-firstrun" && len(args) == 1 {
		return false, nil
	}
	var action string
	switch args[0] {
	case "--squirrel-install", "--squirrel-updated":
		action = "--createShortcut=" + squirrelEntryPoint
	case "--squirrel-uninstall":
		action = "--removeShortcut=" + squirrelEntryPoint
	case "--squirrel-obsolete":
	default:
		return true, errors.New("unsupported Squirrel lifecycle arguments")
	}
	if len(args) != 2 || !validSquirrelVersion(args[1]) {
		return true, errors.New("Squirrel lifecycle requires one numeric package version")
	}
	if args[0] == "--squirrel-obsolete" {
		return true, nil
	}
	exe, err := executable()
	if err != nil {
		return true, errors.New("cannot locate the installed application for Squirrel lifecycle")
	}
	dir := filepath.Dir(exe)
	root := filepath.Dir(dir)
	packageID := map[string]string{"amd64": "MaterialOllamaX64", "arm64": "MaterialOllamaArm64"}[runtime.GOARCH]
	if packageID == "" || !strings.EqualFold(filepath.Base(exe), squirrelEntryPoint) ||
		filepath.Base(dir) != "app-"+args[1] || !strings.EqualFold(filepath.Base(root), packageID) {
		return true, errors.New("Squirrel lifecycle requires the expected installed version directory")
	}
	update := filepath.Join(root, "Update.exe")
	info, err := os.Lstat(update)
	if err != nil || !info.Mode().IsRegular() || info.Size() == 0 {
		return true, errors.New("Squirrel Update.exe is missing or invalid")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()
	if err := run(ctx, update, action, "--shortcut-locations=Desktop,StartMenu"); err != nil {
		return true, fmt.Errorf("Squirrel shortcut operation failed: %w", err)
	}
	return true, nil
}

func validSquirrelVersion(value string) bool {
	parts := strings.Split(value, ".")
	if len(parts) < 3 || len(parts) > 4 {
		return false
	}
	for _, part := range parts {
		if part == "" || len(part) > 10 {
			return false
		}
		for _, c := range part {
			if c < '0' || c > '9' {
				return false
			}
		}
		if _, err := strconv.ParseUint(part, 10, 31); err != nil {
			return false
		}
	}
	return true
}

// runLifecycleProcess starts only the explicitly supplied executable, without a
// shell or console. Output is discarded because installer diagnostics can carry
// private paths. Cancellation terminates this owned process only.
func runLifecycleProcess(ctx context.Context, executable string, args ...string) error {
	cmd := exec.CommandContext(ctx, executable, args...)
	cmd.Dir = filepath.Dir(executable)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: windows.CREATE_NO_WINDOW}
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	cmd.WaitDelay = time.Second
	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return errors.New("operation exceeded its deadline or was cancelled")
		}
		var exit *exec.ExitError
		if errors.As(err, &exit) {
			return fmt.Errorf("process exit code %d", exit.ExitCode())
		}
		var errno syscall.Errno
		if errors.As(err, &errno) {
			return fmt.Errorf("process could not be started (Windows code %d)", uint32(errno))
		}
		return errors.New("process could not be started")
	}
	return nil
}

// ensureBundledWebView2 runs on normal startup only, before creating the UI.
// Installer completion is not readiness: the same runtime probe must pass again.
func ensureBundledWebView2(ctx context.Context) error {
	exe, err := os.Executable()
	if err != nil {
		return errors.New("cannot locate the bundled WebView2 installer")
	}
	return ensureWebView2(ctx, filepath.Dir(exe), runtime.GOARCH, installedWebView2Ready, runLifecycleProcess)
}

func ensureWebView2(ctx context.Context, dir, arch string, ready func(string) bool, run lifecycleProcess) error {
	if ready(arch) {
		return nil
	}
	spec, ok := bundledWebView2Installers[arch]
	if !ok {
		return errors.New("WebView2 is unsupported on this architecture")
	}
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	file, err := openVerifiedWebView2(filepath.Join(dir, "webview2", spec.filename), spec.sha256)
	if err != nil {
		return err
	}
	defer file.Close()
	// The read handle denies writes and deletion until the installer exits, so
	// the executable verified above cannot be replaced between hashing and launch.
	runErr := run(ctx, file.Name(), "/silent", "/install")
	if ctx.Err() != nil {
		return errors.New("WebView2 installation timed out or was cancelled; restart the application to retry")
	}
	if ready(arch) {
		return nil // Includes reboot-requested or concurrent-install completion.
	}
	if runErr != nil {
		return fmt.Errorf("bundled WebView2 installation failed: %w", runErr)
	}
	return errors.New("WebView2 installation completed but a compatible runtime is still unavailable; restart the application to retry")
}

func openVerifiedWebView2(path, digest string) (*os.File, error) {
	name, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return nil, errors.New("bundled WebView2 installer path is invalid")
	}
	handle, err := windows.CreateFile(name, windows.GENERIC_READ, windows.FILE_SHARE_READ, nil,
		windows.OPEN_EXISTING, windows.FILE_ATTRIBUTE_NORMAL|windows.FILE_FLAG_OPEN_REPARSE_POINT, 0)
	if err != nil {
		return nil, errors.New("bundled WebView2 installer is unavailable; repair the application installation")
	}
	file := os.NewFile(uintptr(handle), path)
	valid := false
	defer func() {
		if !valid {
			file.Close()
		}
	}()
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() < 1024*1024 || info.Size() > 512*1024*1024 {
		return nil, errors.New("bundled WebView2 installer is not a bounded regular executable")
	}
	hash := sha256.New()
	if _, err := io.Copy(hash, io.LimitReader(file, 512*1024*1024+1)); err != nil || hex.EncodeToString(hash.Sum(nil)) != digest {
		return nil, errors.New("bundled WebView2 installer checksum does not match the build pin; repair the application installation")
	}
	image, err := pe.NewFile(file)
	if err != nil {
		return nil, errors.New("bundled WebView2 installer is not a valid PE executable")
	}
	image.Close()
	valid = true
	return file, nil
}

func installedWebView2Ready(arch string) bool {
	// Match the embedded loader's search order and 32-bit registry view exactly.
	// It selects HKLM first, so a broken eligible HKLM entry cannot be hidden by
	// a healthy HKCU installation that the renderer would never actually select.
	for _, root := range []registry.Key{registry.LOCAL_MACHINE, registry.CURRENT_USER} {
		state, err := registry.OpenKey(root, webView2StateKey, registry.QUERY_VALUE|registry.WOW64_32KEY)
		if err != nil {
			continue
		}
		path, _, err := state.GetStringValue("EBWebView")
		state.Close()
		parts := strings.Split(filepath.Base(path), ".")
		if err != nil || len(parts) != 4 {
			continue
		}
		build, err := strconv.Atoi(parts[2])
		if err != nil || build < 1150 { // app/webview/webview.h loader api_version.
			continue
		}
		client, err := registry.OpenKey(root, webView2ClientKey, registry.QUERY_VALUE|registry.WOW64_32KEY)
		if err != nil {
			return false
		}
		version, _, err := client.GetStringValue("pv")
		client.Close()
		return err == nil && webView2FilesReady(path, version, arch)
	}
	return false
}

func webView2FilesReady(dir, version, arch string) bool {
	if !filepath.IsAbs(dir) || !webView2VersionAtLeast(version, webView2MinimumVersion) ||
		!webView2VersionAtLeast(filepath.Base(dir), webView2MinimumVersion) {
		return false
	}
	machine := map[string]uint16{"amd64": pe.IMAGE_FILE_MACHINE_AMD64, "arm64": pe.IMAGE_FILE_MACHINE_ARM64}[arch]
	if machine == 0 {
		return false
	}
	folder := map[string]string{"amd64": "x64", "arm64": "arm64"}[arch]
	image, err := pe.Open(filepath.Join(dir, "EBWebView", folder, "EmbeddedBrowserWebView.dll"))
	if err != nil {
		return false
	}
	defer image.Close()
	return image.Machine == machine
}

func webView2VersionAtLeast(actual, minimum string) bool {
	a, b := strings.Split(actual, "."), strings.Split(minimum, ".")
	if len(a) != 4 || len(b) != 4 {
		return false
	}
	var comparison int
	for i := range a {
		av, err := strconv.ParseUint(a[i], 10, 32)
		bv, minErr := strconv.ParseUint(b[i], 10, 32)
		if err != nil || minErr != nil {
			return false
		}
		if comparison == 0 {
			if av < bv {
				comparison = -1
			}
			if av > bv {
				comparison = 1
			}
		}
	}
	return comparison >= 0
}
