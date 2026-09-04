//go:build windows || darwin

// Package store provides a simple JSON file store for the desktop application
// to save and load data such as ollama server configuration, messages,
// login information and more.
package store

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/ollama/ollama/app/types/not"
)

type File struct {
	Filename string `json:"filename"`
	Data     []byte `json:"data"`
}

type User struct {
	Name     string    `json:"name"`
	Email    string    `json:"email"`
	Plan     string    `json:"plan"`
	CachedAt time.Time `json:"cachedAt"`
}

type Message struct {
	Role              string           `json:"role"`
	Content           string           `json:"content"`
	Thinking          string           `json:"thinking"`
	Stream            bool             `json:"stream"`
	Model             string           `json:"model,omitempty"`
	Attachments       []File           `json:"attachments,omitempty"`
	ToolCalls         []ToolCall       `json:"tool_calls,omitempty"`
	ToolCall          *ToolCall        `json:"tool_call,omitempty"`
	ToolName          string           `json:"tool_name,omitempty"`
	ToolResult        *json.RawMessage `json:"tool_result,omitempty"`
	CreatedAt         time.Time        `json:"created_at"`
	UpdatedAt         time.Time        `json:"updated_at"`
	ThinkingTimeStart *time.Time       `json:"thinkingTimeStart,omitempty" ts_type:"Date | undefined" ts_transform:"__VALUE__ && new Date(__VALUE__)"`
	ThinkingTimeEnd   *time.Time       `json:"thinkingTimeEnd,omitempty" ts_type:"Date | undefined" ts_transform:"__VALUE__ && new Date(__VALUE__)"`
}

// MessageOptions contains optional parameters for creating a Message
type MessageOptions struct {
	Model             string
	Attachments       []File
	Stream            bool
	Thinking          string
	ToolCalls         []ToolCall
	ToolCall          *ToolCall
	ToolResult        *json.RawMessage
	ThinkingTimeStart *time.Time
	ThinkingTimeEnd   *time.Time
}

// NewMessage creates a new Message with the given options
func NewMessage(role, content string, opts *MessageOptions) Message {
	now := time.Now()
	msg := Message{
		Role:      role,
		Content:   content,
		CreatedAt: now,
		UpdatedAt: now,
	}

	if opts != nil {
		msg.Model = opts.Model
		msg.Attachments = opts.Attachments
		msg.Stream = opts.Stream
		msg.Thinking = opts.Thinking
		msg.ToolCalls = opts.ToolCalls
		msg.ToolCall = opts.ToolCall
		msg.ToolResult = opts.ToolResult
		msg.ThinkingTimeStart = opts.ThinkingTimeStart
		msg.ThinkingTimeEnd = opts.ThinkingTimeEnd
	}

	return msg
}

type ToolCall struct {
	Type     string       `json:"type"`
	Function ToolFunction `json:"function"`
}

type ToolFunction struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
	Result    any    `json:"result,omitempty"`
}

type Model struct {
	Model      string     `json:"model"`                 // Model name
	Digest     string     `json:"digest,omitempty"`      // Model digest from the registry
	ModifiedAt *time.Time `json:"modified_at,omitempty"` // When the model was last modified locally
}

type Chat struct {
	ID           string          `json:"id"`
	Messages     []Message       `json:"messages"`
	Title        string          `json:"title"`
	CreatedAt    time.Time       `json:"created_at"`
	BrowserState json.RawMessage `json:"browser_state,omitempty" ts_type:"BrowserStateData"`
}

// AppEvent is one row of the Status screen's append-only local version
// history (the app_events table, schema v18). Rows are never updated or
// deleted by the app itself -- see app/ui/release.go's GET/POST
// /api/v1/history handlers.
type AppEvent struct {
	ID      int64     `json:"id"`
	At      time.Time `json:"at"`
	Kind    string    `json:"kind"`
	Summary string    `json:"summary"`
}

// appEventsListLimit bounds how many app_events rows a single GET
// /api/v1/history response returns. The table itself is unbounded and
// append-only; this only bounds one response payload, mirroring
// codexHistoryLimit's role for the Codex harness history in app/ui/codex.go.
const appEventsListLimit = 500

// NewChat creates a new Chat with the ID, with CreatedAt timestamp initialized
func NewChat(id string) *Chat {
	return &Chat{
		ID:        id,
		Messages:  []Message{},
		CreatedAt: time.Now(),
	}
}

type Settings struct {
	// Expose is a boolean that indicates if the ollama server should
	// be exposed to the network
	Expose bool

	// Browser is a boolean that indicates if the ollama server should
	// be exposed to browser windows (e.g. CORS set to allow all origins)
	Browser bool

	// Survey is a boolean that indicates if the user allows anonymous
	// inference information to be shared with Ollama
	Survey bool

	// Models is a string that contains the models to load on startup
	Models string

	// TODO(parthsareen): temporary for experimentation
	// Agent indicates if the app should use multi-turn tools to fulfill user requests
	Agent bool

	// Tools indicates if the app should use single-turn tools to fulfill user requests
	Tools bool

	// WorkingDir specifies the working directory for all agent operations
	WorkingDir string

	// ContextLength specifies the context length for the ollama server (using OLLAMA_CONTEXT_LENGTH)
	ContextLength int

	// TurboEnabled indicates if Ollama Turbo features are enabled
	TurboEnabled bool

	// Maps gpt-oss specific frontend name' BrowserToolEnabled' to db field 'websearch_enabled'
	WebSearchEnabled bool

	// ThinkEnabled indicates if thinking is enabled
	ThinkEnabled bool

	// ThinkLevel indicates the level of thinking to use for models that support multiple levels
	ThinkLevel string

	// SelectedModel stores the last model that the user selected
	SelectedModel string

	// SidebarOpen indicates if the chat sidebar is open
	SidebarOpen bool

	// LastHomeView is retained for settings compatibility and resolves to chat.
	LastHomeView string

	// OnboardingVersion stores the latest onboarding flow the user has completed.
	OnboardingVersion int

	// AutoUpdateEnabled indicates if automatic updates should be downloaded
	AutoUpdateEnabled bool

	// ClaudeDesktopUsed records whether Claude Desktop has ever been connected through Ollama.
	ClaudeDesktopUsed bool

	// UIPreferences holds the desktop UI's own preferences (language mode,
	// funny-level sliders, appearance, narration, and the rest). It is
	// persisted as a single JSON blob (see database.go's ui_preferences
	// column) rather than flattened into individual columns, because its
	// shape changes far more often than the rest of Settings and a JSON
	// blob can grow without a schema migration for every new toggle.
	UIPreferences UIPreferences
}

// UIPreferences is deliberately inconsistent with the rest of Settings, and
// that inconsistency is intentional rather than an oversight: Settings itself
// carries NO json tags (its JSON keys are the PascalCase Go field names,
// because the frontend has read it that way since day one and retagging it
// would break every existing caller). UIPreferences is a new, independently
// versioned JSON blob nested inside that same untagged struct, so its OWN
// outer field ("UIPreferences") still serializes as PascalCase to match the
// surrounding convention -- but everything INSIDE it carries explicit
// camelCase `json` tags, because this is new surface with no legacy readers
// to break and camelCase is what the rest of the frontend's own API types use.
type UIPreferences struct {
	// Version is the schema version of THIS JSON blob's shape, independent of
	// currentSchemaVersion (the SQLite migration version in database.go). It
	// lets decodeUIPreferences recognize and safely discard a blob written by
	// a future app version instead of misinterpreting it.
	Version int `json:"version"`

	// LangMode is one of "en" (English), "yue" (Cantonese), or "both" (bilingual).
	LangMode string `json:"langMode"`

	// FunnyEn and FunnyYue are the per-language funny-level sliders, each
	// clamped to 0 (fully serious) through 4 (maximum playfulness).
	FunnyEn  int `json:"funnyEn"`
	FunnyYue int `json:"funnyYue"`

	// Emoji controls whether dialogs and message boxes show a decorative emoji.
	Emoji bool `json:"emoji"`

	School     SchoolPrefs     `json:"school"`
	Narration  NarrationPrefs  `json:"narration"`
	Appearance AppearancePrefs `json:"appearance"`
	Vocab      []VocabRule     `json:"vocab"`
	Schedules  []ScheduleRule  `json:"schedules"`

	// Hardware is keyed by endpoint id rather than being a single flat
	// struct, because hardware capability is a property of the MACHINE an
	// endpoint talks to, not of this desktop app: a remote endpoint's RAM
	// is not this machine's RAM. Retrofitting a per-endpoint shape after
	// real user data exists under a single flat key would be a migration
	// nobody wants to write, so the map shape is deliberate from the start.
	Hardware map[string]HardwareOverrides `json:"hardware"`

	Endpoints EndpointPrefs `json:"endpoints"`
}

// SchoolPrefs mirrors the shared School-mode contract. There is deliberately
// never a Pin field here: the PIN itself never touches SQLite (see
// SecretStore in secrets.go); only whether one has been set is persisted.
type SchoolPrefs struct {
	On     bool   `json:"on"`
	Name   string `json:"name"`
	PinSet bool   `json:"pinSet"`
}

// NarrationPrefs configures the spoken TTS narrator. Rate is a multiplier on
// the voice's own normal delivery speed (1.0 = normal).
type NarrationPrefs struct {
	On    bool    `json:"on"`
	Lang  string  `json:"lang"`
	Voice string  `json:"voice"`
	Rate  float64 `json:"rate"`
}

// AppearancePrefs holds the Material appearance customization state.
// Overrides is a map of CSS custom-property token name -> value, validated
// against a known allowlist server-side (see app/ui/uh.go) before it is ever
// persisted, since it round-trips into rendered CSS.
type AppearancePrefs struct {
	Seed      string            `json:"seed"`
	Theme     string            `json:"theme"`
	Density   string            `json:"density"`
	Radius    int               `json:"radius"`
	AppName   string            `json:"appName"`
	Glyph     string            `json:"glyph"`
	Overrides map[string]string `json:"overrides"`
}

// VocabRule is one entry of the local personal-vocabulary find/replace list.
type VocabRule struct {
	Find string `json:"find"`
	Repl string `json:"repl"`
}

// ScheduleRule is one entry of the scheduled-settings surface.
type ScheduleRule struct {
	Time string `json:"time"`
	Kind string `json:"kind"`
}

// HardwareOverrides records a user-supplied hardware fact for one endpoint.
// RAMBytes and VRAMBytes are nullable pointers rather than plain uint64 so
// that "the user never told us" (nil) can never be coerced into or confused
// with "the user told us it's zero" (a pointer to 0).
type HardwareOverrides struct {
	RAMBytes  *uint64 `json:"ramBytes"`
	VRAMBytes *uint64 `json:"vramBytes"`
	Note      string  `json:"note"`
}

// EndpointPrefs tracks the configured Ollama-compatible endpoints and which
// one is active. Endpoint deliberately carries no credential field -- only
// TokenSet, exactly like SchoolPrefs.PinSet -- because the actual token lives
// in SecretStore (see secrets.go), never in this JSON blob.
type EndpointPrefs struct {
	ActiveID  string     `json:"activeId"`
	Endpoints []Endpoint `json:"endpoints"`
}

// Endpoint describes one configured Ollama-compatible server. TokenSet
// reports whether a credential has been stored for this endpoint in
// SecretStore; the credential value itself never appears here.
type Endpoint struct {
	ID       string `json:"id"`
	Kind     string `json:"kind"`
	Label    string `json:"label"`
	BaseURL  string `json:"baseUrl"`
	TokenSet bool   `json:"tokenSet"`
}

// uiPreferencesVersion is the current schema version for the UIPreferences
// JSON blob (UIPreferences.Version), independent of currentSchemaVersion in
// database.go, which versions the SQLite table shape instead.
const uiPreferencesVersion = 1

// DefaultUIPreferences returns the safe, zero-risk default UI preferences.
// It is used whenever no preferences have ever been saved, and whenever a
// stored blob cannot be trusted (see decodeUIPreferences in database.go).
func DefaultUIPreferences() UIPreferences {
	return UIPreferences{
		Version:  uiPreferencesVersion,
		LangMode: "en",
		FunnyEn:  2,
		FunnyYue: 2,
		Emoji:    false,
		School:   SchoolPrefs{},
		Narration: NarrationPrefs{
			Lang: "en",
			Rate: 1.0,
		},
		Appearance: AppearancePrefs{
			Theme:   "system",
			Density: "comfortable",
			Radius:  12,
		},
		// Empty slices, never nil. A nil slice marshals to JSON null rather
		// than [], so the renderer receives null where it expects an array and
		// the first .length access throws. That is not hypothetical: it took
		// the entire Settings route down into the router's error boundary with
		// "Cannot read properties of null (reading 'length')", reproduced 4/4.
		// Guarding every read site works but has to be remembered every time;
		// emitting [] here fixes the whole class once.
		Vocab:     []VocabRule{},
		Schedules: []ScheduleRule{},
		Hardware:  map[string]HardwareOverrides{},
		Endpoints: EndpointPrefs{Endpoints: []Endpoint{}},
	}
}

// Keep in sync with CURRENT_ONBOARDING_VERSION in app/ui/app/src/lib/onboarding.ts.
const CurrentOnboardingVersion = 1

type Store struct {
	// DBPath allows overriding the default database path (mainly for testing)
	DBPath string

	// dbMu protects database initialization only
	dbMu sync.Mutex
	db   *database
}

var defaultDBPath = func() string {
	switch runtime.GOOS {
	case "windows":
		return filepath.Join(os.Getenv("LOCALAPPDATA"), "Ollama", "db.sqlite")
	case "darwin":
		return filepath.Join(os.Getenv("HOME"), "Library", "Application Support", "Ollama", "db.sqlite")
	default:
		return filepath.Join(os.Getenv("HOME"), ".ollama", "db.sqlite")
	}
}()

// legacyConfigPath is the path to the old config.json file
var legacyConfigPath = func() string {
	switch runtime.GOOS {
	case "windows":
		return filepath.Join(os.Getenv("LOCALAPPDATA"), "Ollama", "config.json")
	case "darwin":
		return filepath.Join(os.Getenv("HOME"), "Library", "Application Support", "Ollama", "config.json")
	default:
		return filepath.Join(os.Getenv("HOME"), ".ollama", "config.json")
	}
}()

// legacyData represents the old config.json structure (only fields we need to migrate)
type legacyData struct {
	ID           string `json:"id"`
	FirstTimeRun bool   `json:"first-time-run"`
}

func (s *Store) ensureDB() error {
	// Fast path: check if db is already initialized
	if s.db != nil {
		return nil
	}

	// Slow path: initialize database with lock
	s.dbMu.Lock()
	defer s.dbMu.Unlock()

	// Double-check after acquiring lock
	if s.db != nil {
		return nil
	}

	dbPath := s.DBPath
	if dbPath == "" {
		dbPath = defaultDBPath
	}

	// Ensure directory exists
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return fmt.Errorf("create db directory: %w", err)
	}

	database, err := newDatabase(dbPath)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}

	// Generate device ID if needed
	id, err := database.getID()
	if err != nil || id == "" {
		// Generate new UUID for device
		u, err := uuid.NewV7()
		if err == nil {
			database.setID(u.String())
		}
	}

	s.db = database

	// Check if we need to migrate from config.json
	migrated, err := database.isConfigMigrated()
	if err != nil || !migrated {
		if err := s.migrateFromConfig(database); err != nil {
			slog.Warn("failed to migrate from config.json", "error", err)
		}
	}

	// Run one-time migration from legacy airplane_mode behavior.
	if err := s.migrateCloudSetting(database); err != nil {
		return fmt.Errorf("migrate cloud setting: %w", err)
	}

	return nil
}

// migrateCloudSetting migrates legacy airplane_mode into server.json exactly once.
// After this, cloud state is sourced from server.json OR OLLAMA_NO_CLOUD.
func (s *Store) migrateCloudSetting(database *database) error {
	migrated, err := database.isCloudSettingMigrated()
	if err != nil {
		return err
	}
	if migrated {
		return nil
	}

	airplaneMode, err := database.getAirplaneMode()
	if err != nil {
		return err
	}

	if airplaneMode {
		if err := setCloudEnabled(false); err != nil {
			return fmt.Errorf("migrate airplane_mode to cloud disabled: %w", err)
		}
	}

	if err := database.setCloudSettingMigrated(true); err != nil {
		return err
	}

	return nil
}

// migrateFromConfig attempts to migrate ID and FirstTimeRun from config.json
func (s *Store) migrateFromConfig(database *database) error {
	configPath := legacyConfigPath

	// Check if config.json exists
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		// No config to migrate, mark as migrated
		return database.setConfigMigrated(true)
	}

	// Read the config file
	b, err := os.ReadFile(configPath)
	if err != nil {
		return fmt.Errorf("read legacy config: %w", err)
	}

	var legacy legacyData
	if err := json.Unmarshal(b, &legacy); err != nil {
		// If we can't parse it, just mark as migrated and move on
		slog.Warn("failed to parse legacy config.json", "error", err)
		return database.setConfigMigrated(true)
	}

	// Migrate the ID if present
	if legacy.ID != "" {
		if err := database.setID(legacy.ID); err != nil {
			return fmt.Errorf("migrate device ID: %w", err)
		}
		slog.Info("migrated device ID from config.json")
	}

	hasCompleted := legacy.FirstTimeRun // If old FirstTimeRun is true, it means first run was completed
	if err := database.setHasCompletedFirstRun(hasCompleted); err != nil {
		return fmt.Errorf("migrate first time run: %w", err)
	}
	if hasCompleted {
		settings, err := database.getSettings()
		if err != nil {
			return fmt.Errorf("read settings for onboarding migration: %w", err)
		}
		settings.OnboardingVersion = CurrentOnboardingVersion
		if err := database.setSettings(settings); err != nil {
			return fmt.Errorf("migrate onboarding completion: %w", err)
		}
	}
	slog.Info("migrated first run status from config.json", "hasCompleted", hasCompleted)

	// Mark as migrated
	if err := database.setConfigMigrated(true); err != nil {
		return fmt.Errorf("mark config as migrated: %w", err)
	}

	slog.Info("successfully migrated settings from config.json")
	return nil
}

func (s *Store) ID() (string, error) {
	if err := s.ensureDB(); err != nil {
		return "", err
	}

	return s.db.getID()
}

func (s *Store) HasCompletedFirstRun() (bool, error) {
	if err := s.ensureDB(); err != nil {
		return false, err
	}

	return s.db.getHasCompletedFirstRun()
}

func (s *Store) SetHasCompletedFirstRun(hasCompleted bool) error {
	if err := s.ensureDB(); err != nil {
		return err
	}

	return s.db.setHasCompletedFirstRun(hasCompleted)
}

func (s *Store) Settings() (Settings, error) {
	if err := s.ensureDB(); err != nil {
		return Settings{}, fmt.Errorf("load settings: %w", err)
	}

	settings, err := s.db.getSettings()
	if err != nil {
		return Settings{}, err
	}

	// Set default models directory if not set
	if settings.Models == "" {
		dir := os.Getenv("OLLAMA_MODELS")
		if dir != "" {
			settings.Models = dir
		} else {
			home, err := os.UserHomeDir()
			if err == nil {
				settings.Models = filepath.Join(home, ".ollama", "models")
			}
		}
	}

	if settings.LastHomeView == "" {
		settings.LastHomeView = "chat"
	}

	return settings, nil
}

func (s *Store) SetSettings(settings Settings) error {
	if err := s.ensureDB(); err != nil {
		return err
	}

	return s.db.setSettings(settings)
}

func (s *Store) Chats() ([]Chat, error) {
	if err := s.ensureDB(); err != nil {
		return nil, err
	}

	return s.db.getAllChats()
}

func (s *Store) Chat(id string) (*Chat, error) {
	return s.ChatWithOptions(id, true)
}

func (s *Store) ChatWithOptions(id string, loadAttachmentData bool) (*Chat, error) {
	if err := s.ensureDB(); err != nil {
		return nil, err
	}

	chat, err := s.db.getChatWithOptions(id, loadAttachmentData)
	if err != nil {
		return nil, fmt.Errorf("%w: chat %s", not.Found, id)
	}

	return chat, nil
}

func (s *Store) SetChat(chat Chat) error {
	if err := s.ensureDB(); err != nil {
		return err
	}

	return s.db.saveChat(chat)
}

func (s *Store) DeleteChat(id string) error {
	if err := s.ensureDB(); err != nil {
		return err
	}

	// Delete from database
	if err := s.db.deleteChat(id); err != nil {
		return fmt.Errorf("%w: chat %s", not.Found, id)
	}

	// Also delete associated images
	chatImgDir := filepath.Join(s.ImgDir(), id)
	if err := os.RemoveAll(chatImgDir); err != nil {
		// Log error but don't fail the deletion
		slog.Warn("failed to delete chat images", "chat_id", id, "error", err)
	}

	return nil
}

func (s *Store) WindowSize() (int, int, error) {
	if err := s.ensureDB(); err != nil {
		return 0, 0, err
	}

	return s.db.getWindowSize()
}

func (s *Store) SetWindowSize(width, height int) error {
	if err := s.ensureDB(); err != nil {
		return err
	}

	return s.db.setWindowSize(width, height)
}

// AppEvents returns the most recent app_events rows, newest first, bounded
// by appEventsListLimit. The underlying table is unbounded and append-only;
// this only bounds how many rows one response returns.
func (s *Store) AppEvents() ([]AppEvent, error) {
	if err := s.ensureDB(); err != nil {
		return nil, err
	}

	return s.db.getAppEvents(appEventsListLimit)
}

// AppendAppEvent records one new local version-history event and returns it
// with its assigned ID and server-assigned timestamp. kind and summary are
// both required; a blank kind is rejected rather than silently recorded as
// an empty string, since an unlabeled history entry is useless to a reader.
func (s *Store) AppendAppEvent(kind, summary string) (AppEvent, error) {
	if err := s.ensureDB(); err != nil {
		return AppEvent{}, err
	}
	if kind == "" {
		return AppEvent{}, fmt.Errorf("app event kind is required")
	}

	return s.db.appendAppEvent(kind, summary)
}

func (s *Store) UpdateLastMessage(chatID string, message Message) error {
	if err := s.ensureDB(); err != nil {
		return err
	}

	return s.db.updateLastMessage(chatID, message)
}

func (s *Store) AppendMessage(chatID string, message Message) error {
	if err := s.ensureDB(); err != nil {
		return err
	}

	return s.db.appendMessage(chatID, message)
}

func (s *Store) UpdateChatBrowserState(chatID string, state json.RawMessage) error {
	if err := s.ensureDB(); err != nil {
		return err
	}

	return s.db.updateChatBrowserState(chatID, state)
}

func (s *Store) User() (*User, error) {
	if err := s.ensureDB(); err != nil {
		return nil, err
	}

	return s.db.getUser()
}

func (s *Store) SetUser(user User) error {
	if err := s.ensureDB(); err != nil {
		return err
	}

	user.CachedAt = time.Now()
	return s.db.setUser(user)
}

func (s *Store) ClearUser() error {
	if err := s.ensureDB(); err != nil {
		return err
	}

	return s.db.clearUser()
}

func (s *Store) Close() error {
	s.dbMu.Lock()
	defer s.dbMu.Unlock()

	if s.db != nil {
		return s.db.Close()
	}
	return nil
}
