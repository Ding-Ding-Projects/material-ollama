//go:build windows

package updater

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"time"

	"golang.org/x/sys/windows"
)

func transientUpdateRename(e error) bool {
	return errors.Is(e, windows.ERROR_SHARING_VIOLATION) || errors.Is(e, windows.ERROR_ACCESS_DENIED) || errors.Is(e, windows.ERROR_LOCK_VIOLATION)
}

var squirrelUpdateExecutable = func() string {
	exe, e := os.Executable()
	if e != nil {
		return ""
	}
	dir := filepath.Dir(exe)
	// Squirrel installs Update.exe in the parent of app-<version>.
	if filepath.Base(dir) != "app-"+currentVersionForUpdater() {
		return ""
	}
	candidate := filepath.Join(filepath.Dir(dir), "Update.exe")
	info, e := os.Stat(candidate)
	if e != nil || !info.Mode().IsRegular() {
		return ""
	}
	return candidate
}
var squirrelUpdateCommand = func(ctx context.Context, updateExe, packageDir string) error {
	cmd := exec.CommandContext(ctx, updateExe, "--update", packageDir)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	// Provider output can contain user-specific paths and is not retained.
	if e := cmd.Run(); e != nil {
		return errors.New("Squirrel could not install the staged package; previous running version remains active")
	}
	return nil
}
var squirrelRestartCommand = func(updateExe string) error {
	cmd := exec.Command(updateExe, "--processStartAndWait", "ollama app.exe")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if e := cmd.Start(); e != nil {
		return errors.New("Squirrel restart process could not start")
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	// Squirrel's RestartAppWhenExited allows the child 500 ms to capture the
	// parent PID before the application performs normal graceful shutdown.
	select {
	case <-time.After(500 * time.Millisecond):
		return nil
	case <-done:
		return errors.New("Squirrel restart process exited before the application")
	}
}

func installSquirrelPackage(ctx context.Context, packagePath string) error {
	updateExe := squirrelUpdateExecutable()
	if updateExe == "" {
		return errors.New("this copy was not installed with Squirrel.Windows")
	}
	if e := squirrelUpdateCommand(ctx, updateExe, filepath.Dir(packagePath)); e != nil {
		return e
	}
	return squirrelRestartCommand(updateExe)
}
