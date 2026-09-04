//go:build darwin

package updater

import (
	"context"
	"errors"
	"syscall"
)

// Squirrel installation is Windows-only for this delivery lane. Darwin's
// existing archive updater remains available through updater_darwin.go.
func installSquirrelPackage(context.Context, string) error {
	return errors.New("Squirrel package installation is unavailable on this platform")
}

func transientUpdateRename(err error) bool {
	return errors.Is(err, syscall.EPERM) || errors.Is(err, syscall.EACCES) || errors.Is(err, syscall.EBUSY)
}
