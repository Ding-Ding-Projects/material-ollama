//go:build windows || darwin

package ui

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

const (
	codexDiscoveryTimeout = 15 * time.Second
	codexCommandTimeout   = 10 * time.Second
	codexOutputLimit      = 128 * 1024
	codexHistoryLimit     = 100
)

var (
	codexEnvNameRE = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]{0,127}$`)
	codexSecretRE  = regexp.MustCompile(`(?i)(api[_-]?key|auth[_-]?token|access[_-]?token|password|secret|credential)(\s*[:=]\s*)\S+`)
)

// CodexEnvVar is a single explicit environment entry. Secret values are
// accepted for one invocation but are never returned or written to history.
type CodexEnvVar struct {
	Name        string `json:"name"`
	Value       string `json:"value,omitempty"`
	Secret      bool   `json:"secret,omitempty"`
	Configured  bool   `json:"configured,omitempty"`
}

// CodexProfile is the only input shape accepted by the harness. Arguments are
// argv tokens, never a shell command string.
type CodexProfile struct {
	ID                string        `json:"id"`
	Name              string        `json:"name"`
	Executable        string        `json:"executable"`
	Arguments         []string      `json:"arguments,omitempty"`
	Environment       []CodexEnvVar `json:"environment,omitempty"`
	WorkingDirectory  string        `json:"workingDirectory,omitempty"`
	TimeoutSeconds    int           `json:"timeoutSeconds,omitempty"`
	UpdatedAt         time.Time     `json:"updatedAt"`
}

type codexCommand struct {
	Name        string   `json:"name"`
	Aliases     []string `json:"aliases,omitempty"`
	Description string   `json:"description,omitempty"`
	Flags       []string `json:"flags,omitempty"`
}

type codexFlag struct {
	Name        string `json:"name"`
	Value       string `json:"value,omitempty"`
	Description string `json:"description,omitempty"`
}

type codexDiscovery struct {
	Available   bool           `json:"available"`
	Executable  string         `json:"executable,omitempty"`
	Version     string         `json:"version,omitempty"`
	Commands    []codexCommand `json:"commands,omitempty"`
	Flags       []codexFlag    `json:"flags,omitempty"`
	CheckedAt   time.Time      `json:"checkedAt"`
	Error       string         `json:"error,omitempty"`
}

type codexEnvDisplay struct {
	Name       string `json:"name"`
	Value      string `json:"value,omitempty"`
	Secret     bool   `json:"secret,omitempty"`
	Configured bool   `json:"configured,omitempty"`
}

type codexPreflight struct {
	Profile            CodexProfile     `json:"profile"`
	Executable         string           `json:"executable"`
	Arguments          []string         `json:"arguments"`
	CommandPreview     string           `json:"commandPreview"`
	Environment        []codexEnvDisplay `json:"environment,omitempty"`
	WorkingDirectory   string           `json:"workingDirectory"`
	TimeoutSeconds     int              `json:"timeoutSeconds"`
	Warnings           []string         `json:"warnings,omitempty"`
}

type codexSession struct {
	ID              string        `json:"id"`
	ProfileID       string        `json:"profileId,omitempty"`
	ProfileName     string        `json:"profileName,omitempty"`
	CommandPreview  string        `json:"commandPreview"`
	WorkingDirectory string       `json:"workingDirectory"`
	State           string        `json:"state"`
	RollbackState   string        `json:"rollbackState"`
	StartedAt       time.Time     `json:"startedAt"`
	EndedAt         *time.Time    `json:"endedAt,omitempty"`
	ExitCode        *int          `json:"exitCode,omitempty"`
	Stdout          string        `json:"stdout,omitempty"`
	Stderr          string        `json:"stderr,omitempty"`
	Error           string        `json:"error,omitempty"`
}

type codexRunRequest struct {
	Profile          CodexProfile `json:"profile"`
	Prompt           string       `json:"prompt,omitempty"`
	RollbackOnFailure bool        `json:"rollbackOnFailure,omitempty"`
}

type codexEditorRequest struct {
	Editor string `json:"editor,omitempty"`
	Path   string `json:"path"`
}

type codexEvent struct {
	Name string `json:"name"`
	Data any    `json:"data"`
}

type codexSessionRuntime struct {
	codexSession
	cancel      context.CancelFunc
	done        chan struct{}
	mu          sync.Mutex
	events      []codexEvent
	subscribers map[chan codexEvent]struct{}
	snapshot    CodexProfile
}

type codexHistoryFile struct {
	Version  int            `json:"version"`
	Profiles []CodexProfile `json:"profiles,omitempty"`
	Sessions []codexSession `json:"sessions,omitempty"`
}

type codexManager struct {
	mu       sync.Mutex
	profiles []CodexProfile
	history  []codexSession
	sessions map[string]*codexSessionRuntime
	discovery codexDiscovery
	loaded   bool
	path     string
}

func (s *Server) codexManager() *codexManager {
	s.codexMu.Lock()
	defer s.codexMu.Unlock()
	if s.codex == nil {
		s.codex = &codexManager{
			sessions: make(map[string]*codexSessionRuntime),
			path:     codexHistoryPath(),
		}
	}
	return s.codex
}

func codexHistoryPath() string {
	if runtime.GOOS == "windows" {
		return filepath.Join(os.Getenv("LOCALAPPDATA"), "Ollama", "codex-harness.json")
	}
	return filepath.Join(os.Getenv("HOME"), "Library", "Application Support", "Ollama", "codex-harness.json")
}

func (m *codexManager) loadLocked() {
	if m.loaded {
		return
	}
	m.loaded = true
	data, err := os.ReadFile(m.path)
	if err != nil {
		return
	}
	var file codexHistoryFile
	if json.Unmarshal(data, &file) != nil || file.Version != 1 {
		return
	}
	m.profiles = file.Profiles
	m.history = file.Sessions
	for i := range m.profiles {
		m.profiles[i] = sanitizeProfileForResponse(m.profiles[i])
	}
	if len(m.history) > codexHistoryLimit {
		m.history = m.history[len(m.history)-codexHistoryLimit:]
	}
}

func (m *codexManager) persistLocked() error {
	if err := os.MkdirAll(filepath.Dir(m.path), 0o755); err != nil {
		return err
	}
	profiles := make([]CodexProfile, len(m.profiles))
	for i, profile := range m.profiles {
		profiles[i] = sanitizeProfileForResponse(profile)
	}
	data, err := json.MarshalIndent(codexHistoryFile{Version: 1, Profiles: profiles, Sessions: m.history}, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(m.path), ".codex-harness-*.json")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpName, m.path)
}

func sanitizeProfileForResponse(profile CodexProfile) CodexProfile {
	profile.Arguments = slices.Clone(profile.Arguments)
	profile.Environment = slices.Clone(profile.Environment)
	for i := range profile.Environment {
		if profile.Environment[i].Secret {
			profile.Environment[i].Value = ""
		}
	}
	return profile
}

func sanitizeSession(session codexSession) codexSession {
	session.CommandPreview = redactText(session.CommandPreview)
	session.Stdout = redactText(session.Stdout)
	session.Stderr = redactText(session.Stderr)
	session.Error = redactText(session.Error)
	return session
}

func redactText(text string) string {
	if len(text) > codexOutputLimit {
		text = text[:codexOutputLimit] + "\n[output truncated]"
	}
	text = codexSecretRE.ReplaceAllString(text, `$1$2•••`)
	return text
}

func redactArg(arg string) string {
	lower := strings.ToLower(arg)
	for _, marker := range []string{"key", "token", "password", "secret", "credential"} {
		if strings.Contains(lower, marker) {
			if strings.Contains(arg, "=") {
				return arg[:strings.IndexByte(arg, '=')+1] + "•••"
			}
			if strings.HasPrefix(arg, "-") {
				return arg + "=•••"
			}
		}
	}
	return arg
}

func quoteCodexArg(arg string) string {
	if arg == "" {
		return `""`
	}
	if !strings.ContainsAny(arg, " \t\"'") {
		return arg
	}
	return `"` + strings.ReplaceAll(arg, `"`, `\"`) + `"`
}

func codexPreview(executable string, args []string) string {
	parts := make([]string, 0, len(args)+1)
	parts = append(parts, quoteCodexArg(executable))
	for _, arg := range args {
		parts = append(parts, quoteCodexArg(redactArg(arg)))
	}
	return strings.Join(parts, " ")
}

func validateCodexProfile(profile CodexProfile) (CodexProfile, string, error) {
	if strings.TrimSpace(profile.Name) == "" {
		profile.Name = "Codex local"
	}
	if len(profile.Name) > 80 {
		return profile, "", errors.New("profile name is too long")
	}
	if len(profile.Arguments) > 64 {
		return profile, "", errors.New("at most 64 argument tokens are allowed")
	}
	for _, arg := range profile.Arguments {
		if strings.ContainsAny(arg, "\x00\r\n") || len(arg) > 8192 {
			return profile, "", errors.New("arguments must be individual bounded tokens without newlines")
		}
	}
	if len(profile.Environment) > 64 {
		return profile, "", errors.New("at most 64 environment entries are allowed")
	}
	for i := range profile.Environment {
		entry := &profile.Environment[i]
		if !codexEnvNameRE.MatchString(entry.Name) {
			return profile, "", fmt.Errorf("invalid environment variable name %q", entry.Name)
		}
		if strings.ContainsAny(entry.Value, "\x00\r\n") || strings.Contains(entry.Value, "$(") || strings.Contains(entry.Value, "${") || strings.Contains(entry.Value, "`") || strings.Contains(entry.Value, "%") {
			return profile, "", fmt.Errorf("environment value for %s contains unsupported expansion syntax", entry.Name)
		}
		if len(entry.Value) > 8192 {
			return profile, "", fmt.Errorf("environment value for %s is too long", entry.Name)
		}
		if entry.Secret && entry.Value == "" && !entry.Configured {
			return profile, "", fmt.Errorf("secret environment variable %s must be supplied for this run", entry.Name)
		}
		entry.Configured = entry.Configured || entry.Value != ""
	}

	executable := strings.TrimSpace(profile.Executable)
	if executable == "" {
		path, err := resolveCodexExecutable()
		if err != nil {
			return profile, "", err
		}
		executable = path
	}
	resolved, err := resolveAllowedCodexExecutable(executable)
	if err != nil {
		return profile, "", err
	}
	profile.Executable = resolved

	if profile.WorkingDirectory == "" {
		profile.WorkingDirectory, err = os.Getwd()
		if err != nil {
			return profile, "", fmt.Errorf("resolve working directory: %w", err)
		}
	}
	profile.WorkingDirectory, err = filepath.Abs(profile.WorkingDirectory)
	if err != nil {
		return profile, "", fmt.Errorf("resolve working directory: %w", err)
	}
	info, err := os.Stat(profile.WorkingDirectory)
	if err != nil || !info.IsDir() {
		return profile, "", fmt.Errorf("working directory is not an accessible directory: %s", profile.WorkingDirectory)
	}
	if profile.TimeoutSeconds == 0 {
		profile.TimeoutSeconds = 900
	}
	if profile.TimeoutSeconds < 1 || profile.TimeoutSeconds > 3600 {
		return profile, "", errors.New("timeout must be between 1 and 3600 seconds")
	}
	if profile.ID == "" {
		id, err := uuid.NewV7()
		if err != nil {
			return profile, "", err
		}
		profile.ID = id.String()
	}
	profile.UpdatedAt = time.Now()
	return profile, resolved, nil
}

func resolveCodexExecutable() (string, error) {
	for _, candidate := range []string{"codex", "codex.exe", "codex.cmd", "codex.ps1"} {
		if path, err := exec.LookPath(candidate); err == nil {
			return path, nil
		}
	}
	return "", errors.New("Codex CLI executable was not found; install codex or choose its codex wrapper path")
}

func resolveAllowedCodexExecutable(candidate string) (string, error) {
	path := candidate
	if !filepath.IsAbs(path) {
		resolved, err := exec.LookPath(path)
		if err != nil {
			return "", fmt.Errorf("Codex executable %q was not found: %w", candidate, err)
		}
		path = resolved
	}
	absolute, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	base := strings.ToLower(filepath.Base(absolute))
	if !strings.HasPrefix(base, "codex") || !slices.Contains([]string{".exe", ".cmd", ".bat", ".ps1", ""}, strings.ToLower(filepath.Ext(base))) {
		return "", errors.New("executable must be a Codex CLI binary or its codex wrapper")
	}
	if _, err := os.Stat(absolute); err != nil {
		return "", fmt.Errorf("Codex executable is not accessible: %w", err)
	}
	return absolute, nil
}

func codexExecCommand(ctx context.Context, executable string, args ...string) *exec.Cmd {
	ext := strings.ToLower(filepath.Ext(executable))
	switch ext {
	case ".ps1":
		argv := append([]string{"-NoProfile", "-ExecutionPolicy", "Bypass", "-File", executable}, args...)
		return exec.CommandContext(ctx, "powershell.exe", argv...)
	case ".cmd", ".bat":
		// This route is only reachable after the executable allowlist above; user
		// arguments remain individual argv values and are rejected for control
		// characters before they reach this wrapper.
		argv := append([]string{"/d", "/s", "/c", executable}, args...)
		return exec.CommandContext(ctx, "cmd.exe", argv...)
	default:
		return exec.CommandContext(ctx, executable, args...)
	}
}

func parseCodexHelp(output string) (commands []codexCommand, flags []codexFlag) {
	section := ""
	for _, line := range strings.Split(output, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "Commands:" || trimmed == "Options:" || trimmed == "Arguments:" {
			section = trimmed
			continue
		}
		if section == "Commands:" {
			fields := strings.Fields(trimmed)
			if len(fields) == 0 || strings.HasPrefix(fields[0], "-") {
				continue
			}
			name := fields[0]
			if !regexp.MustCompile(`^[a-z][a-z0-9-]*$`).MatchString(name) {
				continue
			}
			aliases := []string{}
			if strings.Contains(trimmed, "[aliases:") {
				aliasText := trimmed[strings.Index(trimmed, "[aliases:")+len("[aliases:"):]
				aliasText = strings.TrimSuffix(aliasText, "]")
				for _, alias := range strings.Fields(aliasText) {
					aliases = append(aliases, strings.TrimSpace(alias))
				}
			}
			description := strings.TrimSpace(strings.TrimPrefix(trimmed, name))
			if i := strings.Index(description, "[aliases:"); i >= 0 {
				description = strings.TrimSpace(description[:i])
			}
			commands = append(commands, codexCommand{Name: name, Aliases: aliases, Description: description})
		}
		if section == "Options:" && strings.HasPrefix(trimmed, "-") {
			parts := strings.Fields(trimmed)
			if len(parts) == 0 {
				continue
			}
			name := parts[0]
			value := ""
			for _, part := range parts[1:] {
				if strings.HasPrefix(part, "-") {
					break
				}
				if strings.HasPrefix(part, "<") {
					value = part
					break
				}
			}
			flags = append(flags, codexFlag{Name: name, Value: value})
		}
	}
	return dedupeCodexCommands(commands), dedupeCodexFlags(flags)
}

func dedupeCodexCommands(commands []codexCommand) []codexCommand {
	seen := map[string]bool{}
	out := make([]codexCommand, 0, len(commands))
	for _, command := range commands {
		if !seen[command.Name] {
			seen[command.Name] = true
			out = append(out, command)
		}
	}
	return out
}

func dedupeCodexFlags(flags []codexFlag) []codexFlag {
	seen := map[string]bool{}
	out := make([]codexFlag, 0, len(flags))
	for _, flag := range flags {
		if !seen[flag.Name] {
			seen[flag.Name] = true
			out = append(out, flag)
		}
	}
	return out
}

func discoverCodex(ctx context.Context) codexDiscovery {
	discovery := codexDiscovery{CheckedAt: time.Now()}
	executable, err := resolveCodexExecutable()
	if err != nil {
		discovery.Error = err.Error()
		return discovery
	}
	discovery.Executable = executable
	versionCtx, cancel := context.WithTimeout(ctx, codexCommandTimeout)
	versionOutput, versionErr := codexExecCommand(versionCtx, executable, "--version").CombinedOutput()
	cancel()
	if versionErr == nil {
		discovery.Version = strings.TrimSpace(string(versionOutput))
	}
	helpCtx, cancel := context.WithTimeout(ctx, codexDiscoveryTimeout)
	defer cancel()
	helpOutput, err := codexExecCommand(helpCtx, executable, "--help").CombinedOutput()
	if err != nil {
		discovery.Error = fmt.Sprintf("Codex help failed: %s", redactText(err.Error()))
		return discovery
	}
	discovery.Commands, discovery.Flags = parseCodexHelp(string(helpOutput))
	for i := range discovery.Commands {
		commandCtx, commandCancel := context.WithTimeout(helpCtx, codexCommandTimeout)
		commandOutput, commandErr := codexExecCommand(commandCtx, executable, discovery.Commands[i].Name, "--help").CombinedOutput()
		commandCancel()
		if commandErr != nil {
			continue
		}
		_, commandFlags := parseCodexHelp(string(commandOutput))
		for _, flag := range commandFlags {
			discovery.Commands[i].Flags = append(discovery.Commands[i].Flags, flag.Name)
		}
		slices.Sort(discovery.Commands[i].Flags)
		discovery.Commands[i].Flags = slices.Compact(discovery.Commands[i].Flags)
	}
	discovery.Available = true
	return discovery
}

func (m *codexManager) getDiscovery(refresh bool) codexDiscovery {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.loadLocked()
	if !refresh && m.discovery.Available && time.Since(m.discovery.CheckedAt) < time.Minute {
		return m.discovery
	}
	m.discovery = discoverCodex(context.Background())
	return m.discovery
}

func (m *codexManager) preflight(profile CodexProfile, prompt string) (codexPreflight, CodexProfile, error) {
	validated, executable, err := validateCodexProfile(profile)
	if err != nil {
		return codexPreflight{}, profile, err
	}
	args := slices.Clone(validated.Arguments)
	if prompt != "" {
		if len(prompt) > 64*1024 {
			return codexPreflight{}, profile, errors.New("prompt is too large")
		}
		args = append(args, prompt)
	}
	preview := codexPreflight{
		Profile:          sanitizeProfileForResponse(validated),
		Executable:       executable,
		Arguments:        slices.Clone(args),
		CommandPreview:   codexPreview(executable, args),
		WorkingDirectory: validated.WorkingDirectory,
		TimeoutSeconds:   validated.TimeoutSeconds,
	}
	for _, env := range validated.Environment {
		preview.Environment = append(preview.Environment, codexEnvDisplay{
			Name: env.Name, Value: func() string { if env.Secret { return "•••" }; return env.Value }(), Secret: env.Secret, Configured: env.Configured,
		})
	}
	if strings.HasSuffix(strings.ToLower(filepath.Ext(executable)), ".ps1") {
		preview.Warnings = append(preview.Warnings, "This Codex wrapper is a PowerShell script; the app invokes it directly with a bounded, non-interactive host.")
	}
	if strings.EqualFold(validated.WorkingDirectory, "") {
		preview.Warnings = append(preview.Warnings, "No working directory was selected; the app will use its current directory.")
	}
	return preview, validated, nil
}

func (m *codexManager) saveProfile(profile CodexProfile) (CodexProfile, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.loadLocked()
	validated, _, err := validateCodexProfile(profile)
	if err != nil {
		return profile, err
	}
	for i := range m.profiles {
		if m.profiles[i].ID == validated.ID {
			m.profiles[i] = validated
			if err := m.persistLocked(); err != nil { return profile, err }
			return sanitizeProfileForResponse(validated), nil
		}
	}
	m.profiles = append(m.profiles, validated)
	if err := m.persistLocked(); err != nil { return profile, err }
	return sanitizeProfileForResponse(validated), nil
}

func (m *codexManager) deleteProfile(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.loadLocked()
	for i, profile := range m.profiles {
		if profile.ID == id {
			m.profiles = append(m.profiles[:i], m.profiles[i+1:]...)
			return m.persistLocked()
		}
	}
	return errors.New("Codex profile not found")
}

func mergeCodexEnvironment(entries []CodexEnvVar) ([]string, error) {
	env := os.Environ()
	positions := make(map[string]int, len(env))
	for i, item := range env {
		if key, _, ok := strings.Cut(item, "="); ok { positions[key] = i }
	}
	for _, entry := range entries {
		if entry.Secret && entry.Value == "" {
			return nil, fmt.Errorf("secret environment variable %s is empty", entry.Name)
		}
		value := entry.Value
		line := entry.Name + "=" + value
		if pos, ok := positions[entry.Name]; ok { env[pos] = line } else { positions[entry.Name] = len(env); env = append(env, line) }
	}
	return env, nil
}

func (m *codexManager) start(request codexRunRequest) (codexPreflight, *codexSessionRuntime, error) {
	preview, profile, err := m.preflight(request.Profile, request.Prompt)
	if err != nil { return codexPreflight{}, nil, err }
	args := slices.Clone(preview.Arguments)
	env, err := mergeCodexEnvironment(profile.Environment)
	if err != nil { return codexPreflight{}, nil, err }
	_ = env // the command goroutine merges again after its context is created.
	start := time.Now()
	id, err := uuid.NewV7()
	if err != nil { return codexPreflight{}, nil, err }
	runtimeState := &codexSessionRuntime{
		codexSession: codexSession{ID: id.String(), ProfileID: profile.ID, ProfileName: profile.Name, CommandPreview: preview.CommandPreview, WorkingDirectory: profile.WorkingDirectory, State: "queued", RollbackState: "available", StartedAt: start},
		done: make(chan struct{}), subscribers: make(map[chan codexEvent]struct{}), snapshot: profile,
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(profile.TimeoutSeconds)*time.Second)
	runtimeState.cancel = cancel
	m.mu.Lock()
	m.loadLocked()
	m.sessions[runtimeState.ID] = runtimeState
	m.history = append(m.history, sanitizeSession(runtimeState.codexSession))
	if len(m.history) > codexHistoryLimit { m.history = m.history[len(m.history)-codexHistoryLimit:] }
	_ = m.persistLocked()
	m.mu.Unlock()
	go m.run(ctx, runtimeState, profile, args, request.RollbackOnFailure)
	return preview, runtimeState, nil
}

func (m *codexManager) run(ctx context.Context, session *codexSessionRuntime, profile CodexProfile, args []string, rollbackOnFailure bool) {
	defer session.cancel()
	defer close(session.done)
	command := codexExecCommand(ctx, profile.Executable, args...)
	command.Dir = profile.WorkingDirectory
	env, err := mergeCodexEnvironment(profile.Environment)
	if err != nil { m.finishSession(session, "failed", nil, err); return }
	command.Env = env
	stdout, err := command.StdoutPipe()
	if err != nil { m.finishSession(session, "failed", nil, err); return }
	stderr, err := command.StderrPipe()
	if err != nil { m.finishSession(session, "failed", nil, err); return }
	if err := command.Start(); err != nil { m.finishSession(session, "failed", nil, err); return }
	session.mu.Lock(); session.State = "running"; session.mu.Unlock()
	m.publish(session, codexEvent{Name: "state", Data: map[string]any{"state": "running"}})
	var wg sync.WaitGroup
	read := func(reader io.Reader, stream string) {
		defer wg.Done()
		scanner := bufio.NewScanner(reader)
		scanner.Buffer(make([]byte, 4096), 64*1024)
		for scanner.Scan() {
			line := redactText(scanner.Text())
			session.mu.Lock()
			if stream == "stdout" { session.Stdout = redactText(session.Stdout + line + "\n") } else { session.Stderr = redactText(session.Stderr + line + "\n") }
			session.mu.Unlock()
			m.publish(session, codexEvent{Name: stream, Data: map[string]string{"line": line}})
		}
	}
	wg.Add(2); go read(stdout, "stdout"); go read(stderr, "stderr")
	err = command.Wait(); wg.Wait()
	if ctx.Err() == context.DeadlineExceeded {
		m.finishSession(session, "timed_out", nil, errors.New("Codex session exceeded its timeout"))
		return
	}
	if ctx.Err() == context.Canceled {
		m.finishSession(session, "cancelled", nil, errors.New("Codex session was cancelled"))
		return
	}
	if err == nil {
		m.finishSession(session, "completed", ptrInt(0), nil)
		return
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		code := exitErr.ExitCode()
		if rollbackOnFailure {
			m.restoreProfile(session.snapshot)
		}
		m.finishSession(session, "failed", &code, err)
		return
	}
	if rollbackOnFailure {
		// Rollback is intentionally limited to the app-managed profile snapshot;
		// the harness never resets a user's workspace or discards Codex edits.
		m.restoreProfile(session.snapshot)
	}
	m.finishSession(session, "failed", nil, err)
}

func ptrInt(value int) *int { return &value }

func (m *codexManager) restoreProfile(profile CodexProfile) {
	m.mu.Lock(); defer m.mu.Unlock(); m.loadLocked()
	for i := range m.profiles { if m.profiles[i].ID == profile.ID { m.profiles[i] = profile; _ = m.persistLocked(); return } }
}

func (m *codexManager) finishSession(session *codexSessionRuntime, state string, exitCode *int, err error) {
	ended := time.Now()
	session.mu.Lock()
	session.State = state
	session.EndedAt = &ended
	session.ExitCode = exitCode
	if err != nil { session.Error = redactText(err.Error()) }
	sessionCopy := sanitizeSession(session.codexSession)
	session.mu.Unlock()
	m.publish(session, codexEvent{Name: "state", Data: map[string]any{"state": state, "exitCode": exitCode, "error": sessionCopy.Error}})
	m.publish(session, codexEvent{Name: "done", Data: sessionCopy})
	m.mu.Lock()
	for i := range m.history { if m.history[i].ID == session.ID { m.history[i] = sessionCopy; break } }
	_ = m.persistLocked()
	m.mu.Unlock()
}

func (m *codexManager) publish(session *codexSessionRuntime, event codexEvent) {
	session.mu.Lock(); session.events = append(session.events, event); subscribers := make([]chan codexEvent, 0, len(session.subscribers)); for sub := range session.subscribers { subscribers = append(subscribers, sub) }; session.mu.Unlock()
	for _, sub := range subscribers { select { case sub <- event: default: } }
}

func (m *codexManager) subscribe(id string) (*codexSessionRuntime, <-chan codexEvent, func(), error) {
	m.mu.Lock(); session, ok := m.sessions[id]; m.mu.Unlock()
	if !ok { return nil, nil, nil, errors.New("Codex session not found") }
	channel := make(chan codexEvent, 32)
	session.mu.Lock()
	for _, event := range session.events { channel <- event }
	session.subscribers[channel] = struct{}{}
	session.mu.Unlock()
	closeFn := func() { session.mu.Lock(); delete(session.subscribers, channel); session.mu.Unlock() }
	return session, channel, closeFn, nil
}

func (m *codexManager) getSession(id string) (codexSession, error) {
	m.mu.Lock(); session, ok := m.sessions[id]; history := slices.Clone(m.history); m.mu.Unlock()
	if ok { session.mu.Lock(); defer session.mu.Unlock(); return sanitizeSession(session.codexSession), nil }
	for _, item := range history { if item.ID == id { return item, nil } }
	return codexSession{}, errors.New("Codex session not found")
}

func (m *codexManager) listProfiles() []CodexProfile { m.mu.Lock(); defer m.mu.Unlock(); m.loadLocked(); out := make([]CodexProfile, len(m.profiles)); for i, profile := range m.profiles { out[i] = sanitizeProfileForResponse(profile) }; return out }
func (m *codexManager) listHistory() []codexSession { m.mu.Lock(); defer m.mu.Unlock(); m.loadLocked(); out := make([]codexSession, len(m.history)); for i, session := range m.history { out[i] = sanitizeSession(session) }; slices.Reverse(out); return out }

func (s *Server) codexDiscovery(w http.ResponseWriter, r *http.Request) error {
	refresh := r.URL.Query().Get("refresh") == "1"
	return json.NewEncoder(w).Encode(s.codexManager().getDiscovery(refresh))
}

func (s *Server) codexProfiles(w http.ResponseWriter, r *http.Request) error {
	manager := s.codexManager()
	switch r.Method {
	case http.MethodGet:
		return json.NewEncoder(w).Encode(map[string]any{"profiles": manager.listProfiles()})
	case http.MethodPost:
		var profile CodexProfile
		if err := json.NewDecoder(io.LimitReader(r.Body, 512*1024)).Decode(&profile); err != nil { return fmt.Errorf("invalid Codex profile: %w", err) }
		saved, err := manager.saveProfile(profile); if err != nil { return err }
		return json.NewEncoder(w).Encode(saved)
	case http.MethodDelete:
		id := r.URL.Query().Get("id"); if id == "" { return errors.New("profile id is required") }
		return manager.deleteProfile(id)
	default:
		return errors.New("method not allowed")
	}
}

func (s *Server) codexPreflight(w http.ResponseWriter, r *http.Request) error {
	var request codexRunRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 512*1024)).Decode(&request); err != nil { return fmt.Errorf("invalid Codex preflight: %w", err) }
	preview, _, err := s.codexManager().preflight(request.Profile, request.Prompt); if err != nil { return err }
	return json.NewEncoder(w).Encode(preview)
}

func (s *Server) codexRun(w http.ResponseWriter, r *http.Request) error {
	var request codexRunRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 512*1024)).Decode(&request); err != nil { return fmt.Errorf("invalid Codex run: %w", err) }
	preview, session, err := s.codexManager().start(request); if err != nil { return err }
	return json.NewEncoder(w).Encode(map[string]any{"session": sanitizeSession(session.codexSession), "preflight": preview})
}

func (s *Server) codexSessions(w http.ResponseWriter, r *http.Request) error {
	manager := s.codexManager()
	if r.Method == http.MethodGet { return json.NewEncoder(w).Encode(map[string]any{"sessions": manager.listHistory()}) }
	return errors.New("method not allowed")
}

func (s *Server) codexSession(w http.ResponseWriter, r *http.Request) error {
	id := r.PathValue("id")
	manager := s.codexManager()
	session, err := manager.getSession(id); if err != nil { return err }; return json.NewEncoder(w).Encode(session)
}

func (s *Server) codexSessionEvents(w http.ResponseWriter, r *http.Request) error {
	return s.codexManager().codexEvents(w, r, r.PathValue("id"))
}

func (s *Server) codexSessionCancel(w http.ResponseWriter, r *http.Request) error {
	if r.Method != http.MethodPost { return errors.New("method not allowed") }
	manager := s.codexManager(); id := r.PathValue("id")
	manager.mu.Lock(); session, ok := manager.sessions[id]; manager.mu.Unlock()
	if !ok { return errors.New("Codex session not found") }
	session.cancel()
	return json.NewEncoder(w).Encode(map[string]string{"state": "cancellation_requested"})
}

func (s *Server) codexSessionRollback(w http.ResponseWriter, r *http.Request) error {
	if r.Method != http.MethodPost { return errors.New("method not allowed") }
	manager := s.codexManager(); id := r.PathValue("id")
	manager.mu.Lock(); session, ok := manager.sessions[id]; manager.mu.Unlock()
	if !ok { return errors.New("Codex session not found") }
	manager.restoreProfile(session.snapshot)
	session.mu.Lock(); session.RollbackState = "restored"; if session.State != "running" && session.State != "queued" { session.State = "rolled_back" }; snapshot := sanitizeSession(session.codexSession); session.mu.Unlock()
	manager.publish(session, codexEvent{Name: "state", Data: map[string]any{"state": snapshot.State, "rollbackState": "restored"}})
	return json.NewEncoder(w).Encode(snapshot)
}

func (m *codexManager) codexEvents(w http.ResponseWriter, r *http.Request, id string) error {
	session, events, closeEvents, err := m.subscribe(id); if err != nil { return err }; defer closeEvents()
	w.Header().Set("Content-Type", "text/event-stream"); w.Header().Set("Cache-Control", "no-cache"); w.Header().Set("Connection", "keep-alive")
	flusher, ok := w.(http.Flusher); if !ok { return errors.New("streaming is not supported") }
	write := func(event codexEvent) { payload, _ := json.Marshal(event.Data); fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event.Name, payload); flusher.Flush() }
	for { select { case event, ok := <-events: if !ok { return nil }; write(event); case <-r.Context().Done(): return nil; case <-session.done: for { select { case event := <-events: write(event); default: return nil } } } }
}

func (s *Server) codexEditor(w http.ResponseWriter, r *http.Request) error {
	var request codexEditorRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 64*1024)).Decode(&request); err != nil { return fmt.Errorf("invalid editor request: %w", err) }
	path, err := filepath.Abs(request.Path); if err != nil { return err }
	if _, err := os.Stat(path); err != nil { return fmt.Errorf("path is not accessible: %w", err) }
	editor, err := resolveCodexEditor(request.Editor); if err != nil { return err }
	args := []string{path}
	if strings.Contains(strings.ToLower(filepath.Base(editor)), "code") { args = []string{"--reuse-window", path} }
	if err := exec.Command(editor, args...).Start(); err != nil { return fmt.Errorf("open editor: %w", err) }
	return json.NewEncoder(w).Encode(map[string]string{"editor": editor, "path": path})
}

func resolveCodexEditor(requested string) (string, error) {
	if requested == "" { requested = os.Getenv("OLLAMA_EDITOR") }
	if requested == "" { requested = os.Getenv("VISUAL") }
	if requested == "" { requested = os.Getenv("EDITOR") }
	if requested == "" { requested = "code" }
	if strings.ContainsAny(requested, " \t\r\n\x00") { return "", errors.New("editor must be a single executable path, not a shell command") }
	path, err := exec.LookPath(requested); if err != nil { return "", fmt.Errorf("editor %q was not found", requested) }
	base := strings.ToLower(filepath.Base(path)); allowed := []string{"code", "code-insiders", "codium", "notepad", "vim", "nvim", "zed", "cursor"}
	for _, name := range allowed { if strings.HasPrefix(strings.TrimSuffix(base, filepath.Ext(base)), name) { return path, nil } }
	return "", errors.New("editor is not on the allowlist (supported: code, code-insiders, codium, notepad, vim, nvim, zed, cursor)")
}
