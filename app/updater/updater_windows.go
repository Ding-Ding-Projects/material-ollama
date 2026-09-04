//go:build windows

package updater

import (
	"fmt"
	"log/slog"
	"os"
	"path"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

var runningInstaller string

type OSVERSIONINFOEXW struct {
	dwOSVersionInfoSize uint32
	dwMajorVersion      uint32
	dwMinorVersion      uint32
	dwBuildNumber       uint32
	dwPlatformId        uint32
	szCSDVersion        [128]uint16
	wServicePackMajor   uint16
	wServicePackMinor   uint16
	wSuiteMask          uint16
	wProductType        uint8
	wReserved           uint8
}

func init() {
	VerifyDownload = verifyDownload
	UserAgentOS = "Windows"
	localAppData := os.Getenv("LOCALAPPDATA")
	appDataDir := filepath.Join(localAppData, "Ollama")
	UpdateStageDir = filepath.Join(appDataDir, "updates_v2")
	UpdateStateFile = filepath.Join(appDataDir, "update-state.json")
	// Discover the immutable architecture assets from this project's release.
	UpdateCheckURLBase = DefaultReleaseURL
	UpgradeLogFile = filepath.Join(appDataDir, "upgrade.log")
	// This is the stable executable name already emitted by the package lane.
	Installer = "ollama app.exe"
	runningInstaller = filepath.Join(appDataDir, Installer)
	UpgradeMarkerFile = filepath.Join(appDataDir, "upgraded")
	loadOSVersion()
}

func loadOSVersion() {
	verInfo := OSVERSIONINFOEXW{dwOSVersionInfoSize: uint32(unsafe.Sizeof(OSVERSIONINFOEXW{}))}
	ntdll, err := windows.LoadDLL("ntdll.dll")
	if err != nil {
		return
	}
	defer ntdll.Release()
	proc, err := ntdll.FindProc("RtlGetVersion")
	if err != nil {
		return
	}
	status, _, _ := proc.Call(uintptr(unsafe.Pointer(&verInfo)))
	if status < 0x80000000 {
		UserAgentOS = fmt.Sprintf("Windows/%d.%d.%d", verInfo.dwMajorVersion, verInfo.dwMinorVersion, verInfo.dwBuildNumber)
	}
}

func getStagedUpdate() string {
	files, err := filepath.Glob(filepath.Join(UpdateStageDir, "*.nupkg"))
	if err != nil || len(files) == 0 {
		return ""
	}
	if len(files) > 1 {
		slog.Warn("multiple staged Squirrel packages found", "packages", files)
	}
	return files[0]
}

func DoUpgrade(_ bool) error {
	return fmt.Errorf("use the explicit Restart to install update action")
}

func DoPostUpgradeCleanup() error {
	_ = os.Remove(UpgradeMarkerFile)
	return nil
}
func verifyDownload() error {
	u := &Updater{}
	m := u.machine()
	if m.validated == nil || m.directory == "" {
		return fmt.Errorf("no validated Squirrel package")
	}
	return validateStagedPackage(m.directory, *m.validated)
}
func IsUpdatePending() bool     { return (&Updater{}).Status().CanRestart }
func DoUpgradeAtStartup() error { return DoUpgrade(false) }
func isInstallerRunning() bool  { return len(IsProcRunning(Installer)) > 0 }

func IsProcRunning(procName string) []uint32 {
	const maxProcessBuffer = 1 << 20
	var pids []uint32
	var processCount int
	for size := 2048; ; size *= 2 {
		pids = make([]uint32, size)
		var ret uint32
		if err := windows.EnumProcesses(pids, &ret); err != nil || ret == 0 {
			return nil
		}
		processCount = int(ret / uint32(unsafe.Sizeof(pids[0])))
		if processCount > len(pids) {
			processCount = len(pids)
		}
		if processCount < len(pids) || size >= maxProcessBuffer {
			break
		}
	}
	pids = pids[:processCount]
	matches := []uint32{}
	for _, pid := range pids {
		if pid == 0 {
			continue
		}
		func() {
			hProcess, err := windows.OpenProcess(windows.PROCESS_QUERY_INFORMATION|windows.PROCESS_VM_READ, false, pid)
			if err != nil {
				return
			}
			defer windows.CloseHandle(hProcess)
			var module windows.Handle
			var cbNeeded uint32
			if err := windows.EnumProcessModules(hProcess, &module, uint32(unsafe.Sizeof(module)), &cbNeeded); err != nil {
				return
			}
			moduleName := make([]uint16, 8192)
			cb := uint32(len(moduleName)) * uint32(unsafe.Sizeof(uint16(0)))
			if err := windows.GetModuleBaseName(hProcess, module, &moduleName[0], cb); err != nil && err != syscall.ERROR_INSUFFICIENT_BUFFER {
				return
			}
			exeFile := path.Base(strings.ToLower(syscall.UTF16ToString(moduleName)))
			if strings.EqualFold(exeFile, procName) {
				matches = append(matches, pid)
			}
		}()
	}
	return matches
}
