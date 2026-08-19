//go:build darwin

package ui

import (
	"fmt"

	"golang.org/x/sys/unix"
)

// freeDiskBytes reports free space on the volume containing path.
// golang.org/x/sys is already a direct module dependency (see go.mod), so
// this adds nothing new.
func freeDiskBytes(path string) (uint64, error) {
	var stat unix.Statfs_t
	if err := unix.Statfs(path, &stat); err != nil {
		return 0, fmt.Errorf("statfs %q: %w", path, err)
	}

	// Bavail is blocks available to an unprivileged process, which is the
	// figure a real download will actually be able to use.
	return uint64(stat.Bavail) * uint64(stat.Bsize), nil
}
