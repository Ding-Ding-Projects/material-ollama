//go:build windows

package store

import (
	"fmt"
	"syscall"
	"unsafe"
)

// Windows Credential Manager constants (wincred.h). Only the pieces this
// file actually uses are declared -- this is not a general wincred binding.
const (
	credTypeGeneric         = 1 // CRED_TYPE_GENERIC
	credPersistLocalMachine = 2 // CRED_PERSIST_LOCAL_MACHINE
	errorNotFound           = syscall.Errno(1168)
)

// credentialW mirrors the Win32 CREDENTIALW struct (wincred.h). Field order
// and sizes must match exactly, since it is passed by pointer across the
// syscall boundary.
type credentialW struct {
	Flags              uint32
	Type               uint32
	TargetName         *uint16
	Comment            *uint16
	LastWritten        syscall.Filetime
	CredentialBlobSize uint32
	CredentialBlob     *byte
	Persist            uint32
	AttributeCount     uint32
	Attributes         uintptr
	TargetAlias        *uint16
	UserName           *uint16
}

// advapi32 and its procs are declared with syscall.NewLazyDLL, matching the
// idiom already used elsewhere in this repository for Windows API access
// (see discover/cpu_windows.go's use of kernel32.dll).
var (
	advapi32       = syscall.NewLazyDLL("advapi32.dll")
	procCredWrite  = advapi32.NewProc("CredWriteW")
	procCredRead   = advapi32.NewProc("CredReadW")
	procCredDelete = advapi32.NewProc("CredDeleteW")
	procCredFree   = advapi32.NewProc("CredFree")
)

// credentialTarget builds the Credential Manager target name for id. Every
// secret this app stores lives under the same "MaterialOllama/" prefix so
// they are identifiable (and, if ever necessary, bulk-removable) in the
// user's own Credential Manager UI without colliding with unrelated
// credentials from other applications.
func credentialTarget(id string) string {
	return "MaterialOllama/" + id
}

type windowsSecretStore struct{}

// NewSecretStore returns a SecretStore backed by the Windows Credential
// Manager (CRED_TYPE_GENERIC, target "MaterialOllama/<id>").
func NewSecretStore() SecretStore {
	return windowsSecretStore{}
}

func (windowsSecretStore) Set(id string, value []byte) error {
	if id == "" {
		return fmt.Errorf("secret id must not be empty")
	}

	targetPtr, err := syscall.UTF16PtrFromString(credentialTarget(id))
	if err != nil {
		return fmt.Errorf("encode credential target: %w", err)
	}

	var blobPtr *byte
	if len(value) > 0 {
		blobPtr = &value[0]
	}

	cred := credentialW{
		Type:               credTypeGeneric,
		TargetName:         targetPtr,
		CredentialBlobSize: uint32(len(value)),
		CredentialBlob:     blobPtr,
		Persist:            credPersistLocalMachine,
	}

	r1, _, callErr := procCredWrite.Call(uintptr(unsafe.Pointer(&cred)), 0)
	if r1 == 0 {
		return fmt.Errorf("CredWriteW failed: %w", callErr)
	}
	return nil
}

func (windowsSecretStore) Get(id string) ([]byte, bool, error) {
	if id == "" {
		return nil, false, fmt.Errorf("secret id must not be empty")
	}

	targetPtr, err := syscall.UTF16PtrFromString(credentialTarget(id))
	if err != nil {
		return nil, false, fmt.Errorf("encode credential target: %w", err)
	}

	var pcred *credentialW
	r1, _, callErr := procCredRead.Call(
		uintptr(unsafe.Pointer(targetPtr)),
		uintptr(credTypeGeneric),
		0,
		uintptr(unsafe.Pointer(&pcred)),
	)
	if r1 == 0 {
		if callErr == errorNotFound {
			return nil, false, nil
		}
		return nil, false, fmt.Errorf("CredReadW failed: %w", callErr)
	}
	defer procCredFree.Call(uintptr(unsafe.Pointer(pcred)))

	if pcred == nil || pcred.CredentialBlobSize == 0 || pcred.CredentialBlob == nil {
		return []byte{}, true, nil
	}

	value := make([]byte, pcred.CredentialBlobSize)
	copy(value, unsafe.Slice(pcred.CredentialBlob, pcred.CredentialBlobSize))
	return value, true, nil
}

func (windowsSecretStore) Delete(id string) error {
	if id == "" {
		return fmt.Errorf("secret id must not be empty")
	}

	targetPtr, err := syscall.UTF16PtrFromString(credentialTarget(id))
	if err != nil {
		return fmt.Errorf("encode credential target: %w", err)
	}

	r1, _, callErr := procCredDelete.Call(uintptr(unsafe.Pointer(targetPtr)), uintptr(credTypeGeneric), 0)
	if r1 == 0 {
		if callErr == errorNotFound {
			// Deleting an id that was never set is not an error.
			return nil
		}
		return fmt.Errorf("CredDeleteW failed: %w", callErr)
	}
	return nil
}

func (s windowsSecretStore) Has(id string) (bool, error) {
	_, ok, err := s.Get(id)
	return ok, err
}
