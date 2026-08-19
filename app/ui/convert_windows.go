//go:build windows

package ui

// Windows Job Object support for convert.go's boundedProcessLimiter: a
// child process spawned to run an external converter tool is placed in a
// Job Object with JOB_OBJECT_LIMIT_PROCESS_MEMORY and
// JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, and ACTIVE_PROCESS=1 to reject any
// process the job doesn't already contain. When the job's handle is
// closed -- which happens the moment the job finishes, is canceled, or
// this process itself dies -- Windows guarantees the whole process tree
// is killed. This is a bounded child process, not a sandbox: it does not
// restrict filesystem or network access, only lifetime and memory.
//
// Nothing in this build's catalog actually reaches this code (see
// convert.go's externalAdapterConvert: every external-tool format ships
// disabled because lib/converters is empty), but it is real, exercised-by-
// contract machinery for the moment that changes.

import (
	"fmt"
	"os/exec"
	"syscall"
	"unsafe"
)

func init() {
	boundedProcessLimiter = windowsJobObjectLimiter
}

var (
	kernel32DLL                  = syscall.NewLazyDLL("kernel32.dll")
	procCreateJobObjectW         = kernel32DLL.NewProc("CreateJobObjectW")
	procSetInformationJobObject  = kernel32DLL.NewProc("SetInformationJobObject")
	procAssignProcessToJobObject = kernel32DLL.NewProc("AssignProcessToJobObject")
	procCloseHandle              = kernel32DLL.NewProc("CloseHandle")
)

const (
	jobObjectExtendedLimitInformation = 9

	jobObjectLimitKillOnJobClose = 0x00002000
	jobObjectLimitProcessMemory  = 0x00000100
	jobObjectLimitActiveProcess  = 0x00000008

	// processAllAccess mirrors PROCESS_ALL_ACCESS, which syscall does not
	// export on this toolchain. AssignProcessToJobObject needs a process
	// handle with, at minimum, PROCESS_SET_QUOTA and PROCESS_TERMINATE;
	// requesting full access is the conventional choice and matches what
	// os.FindProcess itself requests internally.
	processAllAccess = 0x000F0000 | 0x00100000 | 0xFFFF

	// convertJobMemoryLimitBytes bounds the resident memory a bounded
	// child converter process (and everything it spawns) may use. Image
	// decode is the one documented in-process exception to "streaming
	// only" in this pipeline; an external tool gets the same courtesy,
	// bounded generously enough for real audio/video/document work
	// without letting one runaway job starve the rest of the queue.
	convertJobMemoryLimitBytes = 4 << 30 // 4 GiB
)

// jobObjectBasicLimitInformation mirrors the Win32
// JOBOBJECT_BASIC_LIMIT_INFORMATION struct layout exactly (field order and
// widths matter here -- this is passed directly to SetInformationJobObject
// as raw bytes).
type jobObjectBasicLimitInformation struct {
	PerProcessUserTimeLimit int64
	PerJobUserTimeLimit     int64
	LimitFlags              uint32
	MinimumWorkingSetSize   uintptr
	MaximumWorkingSetSize   uintptr
	ActiveProcessLimit      uint32
	Affinity                uintptr
	PriorityClass           uint32
	SchedulingClass         uint32
}

// winIOCounters mirrors IO_COUNTERS, an unused-but-required member of
// JOBOBJECT_EXTENDED_LIMIT_INFORMATION.
type winIOCounters struct {
	ReadOperationCount  uint64
	WriteOperationCount uint64
	OtherOperationCount uint64
	ReadTransferCount   uint64
	WriteTransferCount  uint64
	OtherTransferCount  uint64
}

// jobObjectExtendedLimitInfo mirrors JOBOBJECT_EXTENDED_LIMIT_INFORMATION.
type jobObjectExtendedLimitInfo struct {
	BasicLimitInformation jobObjectBasicLimitInformation
	IoInfo                winIOCounters
	ProcessMemoryLimit    uintptr
	JobMemoryLimit        uintptr
	PeakProcessMemoryUsed uintptr
	PeakJobMemoryUsed     uintptr
}

// windowsJobObjectLimiter creates a Job Object, configures it to kill its
// entire process tree the moment its handle closes and to cap resident
// memory, and assigns cmd's already-started process to it. cmd.Process
// must be non-nil (i.e. this must run after cmd.Start(), before
// cmd.Wait()) -- runExternalTool's Start/limit/Wait ordering guarantees
// that.
//
// There is a narrow, accepted race between the process starting and this
// function assigning it to the job: Go's os/exec does not expose a
// suspended-start primitive, so a process that does meaningful work in
// its first few microseconds could act before containment applies. The
// per-job context deadline and the output-byte cap enforced by
// runExternalTool are the primary bounds for that reason; the Job Object
// is the belt on top of those braces, and it is still what guarantees the
// whole process tree -- including anything the tool itself spawns -- dies
// when the job is released, which a bare context cancellation does not.
//
// release must be called exactly once, after cmd.Wait() returns (or after
// assignment itself fails); it closes the job handle, which kills
// anything still in the job.
func windowsJobObjectLimiter(cmd *exec.Cmd) (func(), error) {
	if cmd.Process == nil {
		return nil, fmt.Errorf("bound process: process has not been started")
	}

	jobHandle, _, callErr := procCreateJobObjectW.Call(0, 0)
	if jobHandle == 0 {
		return nil, fmt.Errorf("CreateJobObjectW failed: %w", callErr)
	}
	closeJob := func() {
		procCloseHandle.Call(jobHandle)
	}

	info := jobObjectExtendedLimitInfo{
		BasicLimitInformation: jobObjectBasicLimitInformation{
			LimitFlags:         jobObjectLimitKillOnJobClose | jobObjectLimitProcessMemory | jobObjectLimitActiveProcess,
			ActiveProcessLimit: 1,
		},
		ProcessMemoryLimit: uintptr(convertJobMemoryLimitBytes),
	}
	if ret, _, callErr := procSetInformationJobObject.Call(
		jobHandle,
		uintptr(jobObjectExtendedLimitInformation),
		uintptr(unsafe.Pointer(&info)),
		unsafe.Sizeof(info),
	); ret == 0 {
		closeJob()
		return nil, fmt.Errorf("SetInformationJobObject failed: %w", callErr)
	}

	processHandle, err := syscall.OpenProcess(processAllAccess, false, uint32(cmd.Process.Pid))
	if err != nil {
		closeJob()
		return nil, fmt.Errorf("OpenProcess failed: %w", err)
	}
	defer syscall.CloseHandle(processHandle)

	if ret, _, callErr := procAssignProcessToJobObject.Call(jobHandle, uintptr(processHandle)); ret == 0 {
		closeJob()
		return nil, fmt.Errorf("AssignProcessToJobObject failed: %w", callErr)
	}

	return closeJob, nil
}
