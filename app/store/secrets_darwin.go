//go:build darwin

package store

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"os/exec"
	"strings"
)

// keychainService is the macOS keychain "service" name every secret this
// app stores is filed under, with the secret id used as the keychain
// "account". Mirrors the "MaterialOllama/<id>" target scheme used on
// Windows (see secrets_windows.go's credentialTarget), just split across the
// two fields the macOS generic-password schema actually has.
const keychainService = "MaterialOllama"

type darwinSecretStore struct{}

// NewSecretStore returns a SecretStore backed by the macOS keychain via the
// `security` CLI.
//
// Every invocation passes arguments as discrete argv entries via
// exec.Command -- never interpolated into a shell string -- so a secret id
// (which, in this app, is always a fixed constant chosen by this package,
// never client-supplied) could not be used to inject additional
// command-line flags or shell metacharacters even if that ever changed.
func NewSecretStore() SecretStore {
	return darwinSecretStore{}
}

// runSecurity runs the `security` CLI with the given argv and returns its
// stdout. stderr is captured only to enrich the returned error.
func runSecurity(args ...string) ([]byte, error) {
	cmd := exec.Command("security", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	return stdout.Bytes(), errWithStderr(err, &stderr)
}

func errWithStderr(err error, stderr *bytes.Buffer) error {
	if err == nil {
		return nil
	}
	if msg := strings.TrimSpace(stderr.String()); msg != "" {
		return fmt.Errorf("%w: %s", err, msg)
	}
	return err
}

func (darwinSecretStore) Set(id string, value []byte) error {
	if id == "" {
		return fmt.Errorf("secret id must not be empty")
	}

	// The keychain generic-password "-w" flag takes its argument as a
	// string, so raw secret bytes are base64-encoded before being handed
	// to `security` and decoded back out on Get.
	encoded := base64.StdEncoding.EncodeToString(value)

	// "-U" updates the item in place if one already exists for this
	// account+service pair, rather than failing with "already exists".
	_, err := runSecurity("add-generic-password", "-a", id, "-s", keychainService, "-w", encoded, "-U")
	if err != nil {
		return fmt.Errorf("security add-generic-password: %w", err)
	}
	return nil
}

func (darwinSecretStore) Get(id string) ([]byte, bool, error) {
	if id == "" {
		return nil, false, fmt.Errorf("secret id must not be empty")
	}

	// find-generic-password exits non-zero when no matching item exists
	// (typically errSecItemNotFound). Any non-zero exit from the command
	// itself (as opposed to a failure to run it at all) is treated as "not
	// found" rather than enumerating every possible keychain error code.
	out, err := runSecurity("find-generic-password", "-a", id, "-s", keychainService, "-w")
	if err != nil {
		if isExitError(err) {
			return nil, false, nil
		}
		return nil, false, fmt.Errorf("security find-generic-password: %w", err)
	}

	encoded := strings.TrimRight(string(out), "\r\n")
	if encoded == "" {
		return []byte{}, true, nil
	}

	value, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, false, fmt.Errorf("decode stored secret: %w", err)
	}
	return value, true, nil
}

func (darwinSecretStore) Delete(id string) error {
	if id == "" {
		return fmt.Errorf("secret id must not be empty")
	}

	_, err := runSecurity("delete-generic-password", "-a", id, "-s", keychainService)
	if err != nil {
		if isExitError(err) {
			// Deleting an id that was never set is not an error.
			return nil
		}
		return fmt.Errorf("security delete-generic-password: %w", err)
	}
	return nil
}

func (s darwinSecretStore) Has(id string) (bool, error) {
	_, ok, err := s.Get(id)
	return ok, err
}

// isExitError reports whether err is (or wraps) an *exec.ExitError, i.e.
// `security` ran and simply exited non-zero, as opposed to failing to run
// at all (binary missing, permission denied, etc.).
func isExitError(err error) bool {
	_, ok := err.(*exec.ExitError)
	if ok {
		return true
	}
	// errWithStderr wraps the original error with %w, so unwrap once more
	// in case that's what we were handed.
	type unwrapper interface{ Unwrap() error }
	if u, ok := err.(unwrapper); ok {
		_, ok := u.Unwrap().(*exec.ExitError)
		return ok
	}
	return false
}
