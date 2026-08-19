//go:build windows

package ui

import (
	"fmt"
	"syscall"
	"unsafe"
)

// freeDiskBytes reports free space on the volume containing path, using the
// same syscall.NewLazyDLL idiom as discover.GetCPUMem (discover/cpu_windows.go)
// so this file adds no new dependency.
var (
	kernel32                = syscall.NewLazyDLL("kernel32.dll")
	getDiskFreeSpaceExWProc = kernel32.NewProc("GetDiskFreeSpaceExW")
)

func freeDiskBytes(path string) (uint64, error) {
	pathPtr, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return 0, fmt.Errorf("invalid path %q: %w", path, err)
	}

	var freeBytesAvailable, totalBytes, totalFreeBytes uint64
	r1, _, callErr := getDiskFreeSpaceExWProc.Call(
		uintptr(unsafe.Pointer(pathPtr)),
		uintptr(unsafe.Pointer(&freeBytesAvailable)),
		uintptr(unsafe.Pointer(&totalBytes)),
		uintptr(unsafe.Pointer(&totalFreeBytes)),
	)
	if r1 == 0 {
		return 0, fmt.Errorf("GetDiskFreeSpaceExW failed for %q: %w", path, callErr)
	}

	// freeBytesAvailable is the caller's quota-aware free space, which is
	// what a real download will actually be able to use.
	return freeBytesAvailable, nil
}
