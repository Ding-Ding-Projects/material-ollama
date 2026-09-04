//go:build windows

package updater

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestSquirrelInstallOrdersUpdateThenRestart(t *testing.T) {
	updateTestConfig(t)
	f := newFeedFixture(t)
	u := &Updater{}
	if _, e := u.DownloadValidatedPackage(t.Context(), f.pkg); e != nil {
		t.Fatal(e)
	}
	oldExe, oldUpdate, oldRestart := squirrelUpdateExecutable, squirrelUpdateCommand, squirrelRestartCommand
	t.Cleanup(func() {
		squirrelUpdateExecutable, squirrelUpdateCommand, squirrelRestartCommand = oldExe, oldUpdate, oldRestart
	})
	squirrelUpdateExecutable = func() string { return "installed/Update.exe" }
	order := []string{}
	squirrelUpdateCommand = func(_ context.Context, exe, dir string) error {
		if exe != "installed/Update.exe" || dir != u.machine().directory {
			t.Fatal("wrong command target")
		}
		if _, e := os.Stat(filepath.Join(dir, "RELEASES")); e != nil {
			t.Fatal(e)
		}
		order = append(order, "update")
		return nil
	}
	squirrelRestartCommand = func(string) error { order = append(order, "restart"); return nil }
	if st, e := u.InstallUpdate(t.Context(), false); e != nil || st.State != UpdateRestarting {
		t.Fatalf("%v %v", st, e)
	}
	if len(order) != 2 || order[0] != "update" || order[1] != "restart" {
		t.Fatal(order)
	}
	if _, e := u.InstallUpdate(t.Context(), false); e == nil {
		t.Fatal("duplicate install accepted")
	}
}
func TestSquirrelInstallFailureDoesNotClaimRollbackOrRestart(t *testing.T) {
	updateTestConfig(t)
	f := newFeedFixture(t)
	u := &Updater{}
	u.DownloadValidatedPackage(t.Context(), f.pkg)
	oldExe, oldUpdate, oldRestart := squirrelUpdateExecutable, squirrelUpdateCommand, squirrelRestartCommand
	t.Cleanup(func() {
		squirrelUpdateExecutable, squirrelUpdateCommand, squirrelRestartCommand = oldExe, oldUpdate, oldRestart
	})
	squirrelUpdateExecutable = func() string { return "Update.exe" }
	squirrelUpdateCommand = func(context.Context, string, string) error { return errors.New("failed") }
	squirrelRestartCommand = func(string) error { t.Fatal("restart after failed installation"); return nil }
	if st, e := u.InstallUpdate(t.Context(), false); e == nil || st.State != UpdateError {
		t.Fatalf("%v %v", st, e)
	}
}
func TestSquirrelStartupAndLegacyUpgradeCannotInstall(t *testing.T) {
	if e := DoUpgradeAtStartup(); e == nil {
		t.Fatal("startup installation accepted")
	}
	if e := DoUpgrade(true); e == nil {
		t.Fatal("legacy bypass accepted")
	}
}
func TestProcessEnumerationFindsTestExecutable(t *testing.T) {
	exe, e := os.Executable()
	if e != nil {
		t.Fatal(e)
	}
	if len(IsProcRunning(filepath.Base(exe))) == 0 {
		t.Fatal("running test executable absent")
	}
}
