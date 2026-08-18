//go:build windows || darwin

package ui

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/ollama/ollama/envconfig"
)

const configProfilesSchemaVersion = 1

var errConfigProfileNotFound = errors.New("configuration profile not found")

// ConfigProfile stores only explicit environment overrides. An omitted key
// inherits the baseline value that was present when the managed service was
// started; an empty value deliberately unsets that key for the next restart.
type ConfigProfile struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Description string            `json:"description,omitempty"`
	Values      map[string]string `json:"values"`
	CreatedAt   time.Time         `json:"createdAt"`
	UpdatedAt   time.Time         `json:"updatedAt"`
}

type configProfilesFile struct {
	SchemaVersion int               `json:"schemaVersion"`
	ActiveProfile string            `json:"activeProfile,omitempty"`
	AppliedValues map[string]string `json:"appliedValues,omitempty"`
	Profiles      []ConfigProfile   `json:"profiles"`
}

// ConfigProfilesResponse is returned to the Settings surface together with
// effective configuration metadata and the active profile id.
type ConfigProfilesResponse struct {
	SchemaVersion int                   `json:"schemaVersion"`
	ActiveProfile string                `json:"activeProfile,omitempty"`
	Profiles      []ConfigProfile       `json:"profiles"`
	Configuration []ConfigurationOption `json:"configuration"`
}

type ConfigProfileApplyResponse struct {
	Profile          ConfigProfile `json:"profile"`
	ActiveProfile    string        `json:"activeProfile"`
	RestartRequested bool          `json:"restartRequested"`
}

// ConfigProfileManager persists profiles in the app's private configuration
// directory and applies only allowlisted Ollama environment keys to the
// service owned by this desktop app. It never accepts arbitrary environment
// names and never replaces values supplied by the process owner.
type ConfigProfileManager struct {
	mu sync.Mutex

	path string

	allowed     map[string]struct{}
	baseline    map[string]string
	baselineSet map[string]bool
	external    map[string]bool

	state configProfilesFile
}

func NewConfigProfileManager() (*ConfigProfileManager, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return nil, fmt.Errorf("resolve Ollama configuration directory: %w", err)
	}

	values := envconfig.AsMap()
	m := &ConfigProfileManager{
		path:        filepath.Join(configDir, "Ollama", "config-profiles.json"),
		allowed:     make(map[string]struct{}, len(values)),
		baseline:    make(map[string]string, len(values)),
		baselineSet: make(map[string]bool, len(values)),
		external:    make(map[string]bool, len(values)),
		state: configProfilesFile{
			SchemaVersion: configProfilesSchemaVersion,
			Profiles:      []ConfigProfile{},
			AppliedValues: map[string]string{},
		},
	}
	for key := range values {
		m.allowed[key] = struct{}{}
		if value, ok := lookupEnvironment(key); ok {
			m.baseline[key] = value
			m.baselineSet[key] = true
			m.external[key] = true
		}
	}
	if err := m.load(); err != nil {
		return nil, err
	}
	return m, nil
}

func (m *ConfigProfileManager) load() error {
	data, err := os.ReadFile(m.path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read configuration profiles: %w", err)
	}

	var state configProfilesFile
	if err := json.Unmarshal(data, &state); err != nil {
		return fmt.Errorf("parse configuration profiles: %w", err)
	}
	if state.SchemaVersion == 0 {
		state.SchemaVersion = configProfilesSchemaVersion
	}
	if state.SchemaVersion != configProfilesSchemaVersion {
		return fmt.Errorf("unsupported configuration profile schema %d", state.SchemaVersion)
	}
	if state.AppliedValues == nil {
		state.AppliedValues = map[string]string{}
	}
	if state.Profiles == nil {
		state.Profiles = []ConfigProfile{}
	}
	for i := range state.Profiles {
		if err := m.validateProfile(state.Profiles[i]); err != nil {
			return fmt.Errorf("invalid configuration profile %q: %w", state.Profiles[i].Name, err)
		}
	}
	m.state = state
	return nil
}

func (m *ConfigProfileManager) validateProfile(profile ConfigProfile) error {
	if strings.TrimSpace(profile.ID) == "" {
		return errors.New("profile id is required")
	}
	if name := strings.TrimSpace(profile.Name); name == "" || len(name) > 80 {
		return errors.New("profile name must be between 1 and 80 characters")
	}
	if len(profile.Description) > 280 {
		return errors.New("profile description must be at most 280 characters")
	}
	if len(profile.Values) > len(m.allowed) {
		return errors.New("profile contains too many configuration values")
	}
	for key, value := range profile.Values {
		if _, ok := m.allowed[key]; !ok {
			return fmt.Errorf("unsupported configuration key %q", key)
		}
		if strings.ContainsAny(value, "\r\n") {
			return fmt.Errorf("configuration value %q contains a line break", key)
		}
		if len(value) > 4096 {
			return fmt.Errorf("configuration value %q is too long", key)
		}
	}
	return nil
}

func copyValues(values map[string]string) map[string]string {
	copy := make(map[string]string, len(values))
	for key, value := range values {
		copy[key] = value
	}
	return copy
}

func copyProfiles(profiles []ConfigProfile) []ConfigProfile {
	copy := make([]ConfigProfile, len(profiles))
	for i, profile := range profiles {
		copy[i] = profile
		copy[i].Values = copyValues(profile.Values)
	}
	return copy
}

func (m *ConfigProfileManager) snapshotLocked() ConfigProfilesResponse {
	return ConfigProfilesResponse{
		SchemaVersion: configProfilesSchemaVersion,
		ActiveProfile: m.state.ActiveProfile,
		Profiles:      copyProfiles(m.state.Profiles),
		Configuration: configurationOptions(),
	}
}

func (m *ConfigProfileManager) Snapshot() ConfigProfilesResponse {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.snapshotLocked()
}

func (m *ConfigProfileManager) findProfileLocked(id string) (int, error) {
	for i := range m.state.Profiles {
		if m.state.Profiles[i].ID == id {
			return i, nil
		}
	}
	return -1, errConfigProfileNotFound
}

func (m *ConfigProfileManager) validateNameLocked(name, id string) error {
	for _, profile := range m.state.Profiles {
		if profile.ID != id && strings.EqualFold(strings.TrimSpace(profile.Name), strings.TrimSpace(name)) {
			return errors.New("a configuration profile with that name already exists")
		}
	}
	return nil
}

func (m *ConfigProfileManager) Create(name, description string, values map[string]string) (ConfigProfile, error) {
	now := time.Now().UTC()
	profile := ConfigProfile{
		ID:          uuid.NewString(),
		Name:        strings.TrimSpace(name),
		Description: strings.TrimSpace(description),
		Values:      copyValues(values),
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if err := m.validateProfile(profile); err != nil {
		return ConfigProfile{}, err
	}
	if err := m.validateNameLocked(profile.Name, profile.ID); err != nil {
		return ConfigProfile{}, err
	}
	m.state.Profiles = append(m.state.Profiles, profile)
	if err := m.saveLocked(); err != nil {
		m.state.Profiles = m.state.Profiles[:len(m.state.Profiles)-1]
		return ConfigProfile{}, err
	}
	return profile, nil
}

func (m *ConfigProfileManager) Update(id, name, description string, values map[string]string) (ConfigProfile, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	index, err := m.findProfileLocked(id)
	if err != nil {
		return ConfigProfile{}, err
	}
	profile := m.state.Profiles[index]
	profile.Name = strings.TrimSpace(name)
	profile.Description = strings.TrimSpace(description)
	profile.Values = copyValues(values)
	profile.UpdatedAt = time.Now().UTC()
	if err := m.validateProfile(profile); err != nil {
		return ConfigProfile{}, err
	}
	if err := m.validateNameLocked(profile.Name, profile.ID); err != nil {
		return ConfigProfile{}, err
	}
	old := m.state.Profiles[index]
	m.state.Profiles[index] = profile
	if err := m.saveLocked(); err != nil {
		m.state.Profiles[index] = old
		return ConfigProfile{}, err
	}
	return profile, nil
}

func (m *ConfigProfileManager) Delete(id string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	index, err := m.findProfileLocked(id)
	if err != nil {
		return false, err
	}
	if m.state.ActiveProfile == id {
		if err := m.restoreAppliedLocked(); err != nil {
			return false, err
		}
		m.state.ActiveProfile = ""
	}
	removed := m.state.Profiles[index]
	m.state.Profiles = append(m.state.Profiles[:index], m.state.Profiles[index+1:]...)
	if err := m.saveLocked(); err != nil {
		m.state.Profiles = append(m.state.Profiles[:index], append([]ConfigProfile{removed}, m.state.Profiles[index:]...)...)
		return false, err
	}
	return removed.ID == id, nil
}

func (m *ConfigProfileManager) restoreAppliedLocked() error {
	for key := range m.state.AppliedValues {
		if m.external[key] {
			continue
		}
		if value, ok := m.baseline[key]; ok && m.baselineSet[key] {
			if err := os.Setenv(key, value); err != nil {
				return fmt.Errorf("restore %s: %w", key, err)
			}
		} else if err := os.Unsetenv(key); err != nil {
			return fmt.Errorf("unset %s: %w", key, err)
		}
	}
	m.state.AppliedValues = map[string]string{}
	return nil
}

func (m *ConfigProfileManager) applyLocked(profile ConfigProfile) error {
	if err := m.validateProfile(profile); err != nil {
		return err
	}
	blocked := make([]string, 0)
	for key, value := range profile.Values {
		if m.external[key] {
			baseline := m.baseline[key]
			if value != baseline {
				blocked = append(blocked, key)
			}
		}
	}
	if len(blocked) > 0 {
		sort.Strings(blocked)
		return fmt.Errorf("profile cannot override externally supplied environment: %s", strings.Join(blocked, ", "))
	}

	if err := m.restoreAppliedLocked(); err != nil {
		return err
	}
	for key, value := range profile.Values {
		if m.external[key] {
			continue
		}
		if value == "" {
			if err := os.Unsetenv(key); err != nil {
				return fmt.Errorf("unset %s: %w", key, err)
			}
		} else if err := os.Setenv(key, value); err != nil {
			return fmt.Errorf("set %s: %w", key, err)
		}
	}
	m.state.AppliedValues = copyValues(profile.Values)
	m.state.ActiveProfile = profile.ID
	return nil
}

// ApplyActive applies the profile selected in the persisted state. It is
// called before the managed service starts so the first service process uses
// the same values shown by the GUI.
func (m *ConfigProfileManager) ApplyActive() (ConfigProfileApplyResponse, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.state.ActiveProfile == "" {
		return ConfigProfileApplyResponse{}, nil
	}
	index, err := m.findProfileLocked(m.state.ActiveProfile)
	if err != nil {
		m.state.ActiveProfile = ""
		m.state.AppliedValues = map[string]string{}
		return ConfigProfileApplyResponse{}, m.saveLocked()
	}
	profile := m.state.Profiles[index]
	if err := m.applyLocked(profile); err != nil {
		return ConfigProfileApplyResponse{}, err
	}
	if err := m.saveLocked(); err != nil {
		return ConfigProfileApplyResponse{}, err
	}
	return ConfigProfileApplyResponse{Profile: profile, ActiveProfile: profile.ID}, nil
}

func (m *ConfigProfileManager) Apply(id string) (ConfigProfileApplyResponse, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	index, err := m.findProfileLocked(id)
	if err != nil {
		return ConfigProfileApplyResponse{}, err
	}
	profile := m.state.Profiles[index]
	if err := m.applyLocked(profile); err != nil {
		return ConfigProfileApplyResponse{}, err
	}
	if err := m.saveLocked(); err != nil {
		return ConfigProfileApplyResponse{}, err
	}
	return ConfigProfileApplyResponse{Profile: profile, ActiveProfile: profile.ID, RestartRequested: true}, nil
}

func (m *ConfigProfileManager) saveLocked() error {
	directory := filepath.Dir(m.path)
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return fmt.Errorf("create configuration directory: %w", err)
	}
	data, err := json.MarshalIndent(m.state, "", "  ")
	if err != nil {
		return fmt.Errorf("encode configuration profiles: %w", err)
	}
	temporary, err := os.CreateTemp(directory, ".config-profiles-*.tmp")
	if err != nil {
		return fmt.Errorf("create configuration profile staging file: %w", err)
	}
	temporaryName := temporary.Name()
	defer os.Remove(temporaryName)
	if err := temporary.Chmod(0o600); err != nil {
		_ = temporary.Close()
		return fmt.Errorf("protect configuration profile staging file: %w", err)
	}
	if _, err := temporary.Write(data); err != nil {
		_ = temporary.Close()
		return fmt.Errorf("write configuration profiles: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		_ = temporary.Close()
		return fmt.Errorf("flush configuration profiles: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close configuration profiles: %w", err)
	}
	if err := os.Rename(temporaryName, m.path); err != nil {
		return fmt.Errorf("replace configuration profiles: %w", err)
	}
	return nil
}
