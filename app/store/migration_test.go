//go:build windows || darwin

package store

import (
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"testing"
)

func TestConfigMigration(t *testing.T) {
	tmpDir := t.TempDir()
	// Create a legacy config.json
	legacyConfig := legacyData{
		ID:           "test-device-id-12345",
		FirstTimeRun: true, // In old system, true meant "has completed first run"
	}

	configData, err := json.MarshalIndent(legacyConfig, "", "  ")
	if err != nil {
		t.Fatal(err)
	}

	configPath := filepath.Join(tmpDir, "config.json")
	if err := os.WriteFile(configPath, configData, 0o644); err != nil {
		t.Fatal(err)
	}

	// Override the legacy config path for testing
	oldLegacyConfigPath := legacyConfigPath
	legacyConfigPath = configPath
	defer func() { legacyConfigPath = oldLegacyConfigPath }()

	// Create store with database in same directory
	s := Store{DBPath: filepath.Join(tmpDir, "db.sqlite")}
	defer s.Close()

	// First access should trigger migration
	id, err := s.ID()
	if err != nil {
		t.Fatalf("failed to get ID: %v", err)
	}

	if id != "test-device-id-12345" {
		t.Errorf("expected migrated ID 'test-device-id-12345', got '%s'", id)
	}

	// Check HasCompletedFirstRun
	hasCompleted, err := s.HasCompletedFirstRun()
	if err != nil {
		t.Fatalf("failed to get has completed first run: %v", err)
	}

	if !hasCompleted {
		t.Error("expected has completed first run to be true after migration")
	}

	// Verify migration is marked as complete
	migrated, err := s.db.isConfigMigrated()
	if err != nil {
		t.Fatalf("failed to check migration status: %v", err)
	}

	if !migrated {
		t.Error("expected config to be marked as migrated")
	}

	// Create a new store instance to verify migration doesn't run again
	s2 := Store{DBPath: filepath.Join(tmpDir, "db.sqlite")}
	defer s2.Close()

	// Delete the config file to ensure we're not reading from it
	os.Remove(configPath)

	// Verify data is still there
	id2, err := s2.ID()
	if err != nil {
		t.Fatalf("failed to get ID from second store: %v", err)
	}

	if id2 != "test-device-id-12345" {
		t.Errorf("expected persisted ID 'test-device-id-12345', got '%s'", id2)
	}
}

func TestNoConfigToMigrate(t *testing.T) {
	tmpDir := t.TempDir()
	// Override the legacy config path for testing
	oldLegacyConfigPath := legacyConfigPath
	legacyConfigPath = filepath.Join(tmpDir, "config.json")
	defer func() { legacyConfigPath = oldLegacyConfigPath }()

	// Create store without any config.json
	s := Store{DBPath: filepath.Join(tmpDir, "db.sqlite")}
	defer s.Close()

	// Should generate a new ID
	id, err := s.ID()
	if err != nil {
		t.Fatalf("failed to get ID: %v", err)
	}

	if id == "" {
		t.Error("expected auto-generated ID, got empty string")
	}

	// HasCompletedFirstRun should be false (default)
	hasCompleted, err := s.HasCompletedFirstRun()
	if err != nil {
		t.Fatalf("failed to get has completed first run: %v", err)
	}

	if hasCompleted {
		t.Error("expected has completed first run to be false by default")
	}

	// Migration should still be marked as complete
	migrated, err := s.db.isConfigMigrated()
	if err != nil {
		t.Fatalf("failed to check migration status: %v", err)
	}

	if !migrated {
		t.Error("expected config to be marked as migrated even with no config.json")
	}
}

func TestCloudMigrationFromAirplaneMode(t *testing.T) {
	tmpHome := t.TempDir()
	setTestHome(t, tmpHome)
	t.Setenv("OLLAMA_NO_CLOUD", "")

	dbPath := filepath.Join(tmpHome, "db.sqlite")
	db, err := newDatabase(dbPath)
	if err != nil {
		t.Fatalf("failed to create database: %v", err)
	}

	if _, err := db.conn.Exec("UPDATE settings SET airplane_mode = 1, cloud_setting_migrated = 0"); err != nil {
		db.Close()
		t.Fatalf("failed to seed airplane migration state: %v", err)
	}
	db.Close()

	s := Store{DBPath: dbPath}
	defer s.Close()

	// Trigger DB initialization + one-time cloud migration.
	if _, err := s.ID(); err != nil {
		t.Fatalf("failed to initialize store: %v", err)
	}

	disabled, err := s.CloudDisabled()
	if err != nil {
		t.Fatalf("CloudDisabled() error: %v", err)
	}
	if !disabled {
		t.Fatal("expected cloud to be disabled after migrating airplane_mode=true")
	}

	configPath := filepath.Join(tmpHome, ".ollama", serverConfigFilename)
	data, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("failed to read migrated server config: %v", err)
	}

	var cfg map[string]any
	if err := json.Unmarshal(data, &cfg); err != nil {
		t.Fatalf("failed to parse migrated server config: %v", err)
	}
	if cfg["disable_ollama_cloud"] != true {
		t.Fatalf("disable_ollama_cloud = %v, want true", cfg["disable_ollama_cloud"])
	}

	var airplaneMode, migrated bool
	if err := s.db.conn.QueryRow("SELECT airplane_mode, cloud_setting_migrated FROM settings").Scan(&airplaneMode, &migrated); err != nil {
		t.Fatalf("failed to read migration flags from DB: %v", err)
	}
	if !airplaneMode {
		t.Fatal("expected legacy airplane_mode value to remain unchanged")
	}
	if !migrated {
		t.Fatal("expected cloud_setting_migrated to be true")
	}
}

const (
	v1Schema = `
	CREATE TABLE IF NOT EXISTS settings (
		id INTEGER PRIMARY KEY CHECK (id = 1),
		device_id TEXT NOT NULL DEFAULT '',
		has_completed_first_run BOOLEAN NOT NULL DEFAULT 0,
		expose BOOLEAN NOT NULL DEFAULT 0,
		browser BOOLEAN NOT NULL DEFAULT 0,
		models TEXT NOT NULL DEFAULT '',
		remote TEXT NOT NULL DEFAULT '',
		agent BOOLEAN NOT NULL DEFAULT 0,
		tools BOOLEAN NOT NULL DEFAULT 0,
		working_dir TEXT NOT NULL DEFAULT '',
		window_width INTEGER NOT NULL DEFAULT 0,
		window_height INTEGER NOT NULL DEFAULT 0,
		config_migrated BOOLEAN NOT NULL DEFAULT 0,
		schema_version INTEGER NOT NULL DEFAULT 1
	);

	-- Insert default settings row if it doesn't exist
	INSERT OR IGNORE INTO settings (id) VALUES (1);

	CREATE TABLE IF NOT EXISTS chats (
		id TEXT PRIMARY KEY,
		title TEXT NOT NULL DEFAULT '',
		created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS messages (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		chat_id TEXT NOT NULL,
		role TEXT NOT NULL,
		content TEXT NOT NULL DEFAULT '',
		thinking TEXT NOT NULL DEFAULT '',
		stream BOOLEAN NOT NULL DEFAULT 0,
		model_name TEXT,
		model_cloud BOOLEAN,
		model_ollama_host BOOLEAN,
		created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
		thinking_time_start TIMESTAMP,
		thinking_time_end TIMESTAMP,
		FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);

	CREATE TABLE IF NOT EXISTS tool_calls (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		message_id INTEGER NOT NULL,
		type TEXT NOT NULL,
		function_name TEXT NOT NULL,
		function_arguments TEXT NOT NULL,
		function_result TEXT,
		FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_tool_calls_message_id ON tool_calls(message_id);
	`
)

func TestMigrationFromEpoc(t *testing.T) {
	tmpDir := t.TempDir()
	s := Store{DBPath: filepath.Join(tmpDir, "db.sqlite")}
	defer s.Close()
	// Open database connection
	conn, err := sql.Open("sqlite3", s.DBPath+"?_foreign_keys=on&_journal_mode=WAL")
	if err != nil {
		t.Fatal(err)
	}
	// Test the connection
	if err := conn.Ping(); err != nil {
		conn.Close()
		t.Fatal(err)
	}
	s.db = &database{conn: conn}
	t.Logf("DB created: %s", s.DBPath)
	_, err = s.db.conn.Exec(v1Schema)
	if err != nil {
		t.Fatal(err)
	}
	version, err := s.db.getSchemaVersion()
	if err != nil {
		t.Fatalf("failed to get schema version: %v", err)
	}
	if version != 1 {
		t.Fatalf("expected: %d\n got: %d", 1, version)
	}

	t.Logf("v1 schema created")
	if err := s.db.migrate(); err != nil {
		t.Fatal(err)
	}
	t.Logf("migrations completed")
	version, err = s.db.getSchemaVersion()
	if err != nil {
		t.Fatalf("failed to get schema version: %v", err)
	}
	if version != currentSchemaVersion {
		t.Fatalf("expected: %d\n got: %d", currentSchemaVersion, version)
	}
}

// v16Schema is the settings table exactly as it existed at schema version 16
// (i.e. the CREATE TABLE from database.go's init(), minus the ui_preferences
// column and with schema_version DEFAULT 16), following the same
// build-an-old-schema-from-an-inline-constant pattern as v1Schema above.
const v16Schema = `
	CREATE TABLE IF NOT EXISTS settings (
		id INTEGER PRIMARY KEY CHECK (id = 1),
		device_id TEXT NOT NULL DEFAULT '',
		has_completed_first_run BOOLEAN NOT NULL DEFAULT 0,
		expose BOOLEAN NOT NULL DEFAULT 0,
		survey BOOLEAN NOT NULL DEFAULT TRUE,
		browser BOOLEAN NOT NULL DEFAULT 0,
		models TEXT NOT NULL DEFAULT '',
		agent BOOLEAN NOT NULL DEFAULT 0,
		tools BOOLEAN NOT NULL DEFAULT 0,
		working_dir TEXT NOT NULL DEFAULT '',
		context_length INTEGER NOT NULL DEFAULT 0,
		window_width INTEGER NOT NULL DEFAULT 0,
		window_height INTEGER NOT NULL DEFAULT 0,
		config_migrated BOOLEAN NOT NULL DEFAULT 0,
		airplane_mode BOOLEAN NOT NULL DEFAULT 0,
		turbo_enabled BOOLEAN NOT NULL DEFAULT 0,
		websearch_enabled BOOLEAN NOT NULL DEFAULT 0,
		selected_model TEXT NOT NULL DEFAULT '',
		sidebar_open BOOLEAN NOT NULL DEFAULT 0,
		last_home_view TEXT NOT NULL DEFAULT 'launch',
		think_enabled BOOLEAN NOT NULL DEFAULT 0,
		think_level TEXT NOT NULL DEFAULT '',
		cloud_setting_migrated BOOLEAN NOT NULL DEFAULT 0,
		remote TEXT NOT NULL DEFAULT '', -- deprecated
		auto_update_enabled BOOLEAN NOT NULL DEFAULT 1,
		schema_version INTEGER NOT NULL DEFAULT 16
	);

	-- Insert default settings row if it doesn't exist
	INSERT OR IGNORE INTO settings (id) VALUES (1);
	`

// TestMigrationV16ToV17 proves the four migration sites (schema constant,
// DDL, migrate() switch/migrateV16ToV17, and the getSettings/setSettings
// column lists) are all wired together correctly: a v16 database gets the
// ui_preferences column, defaults it to ”, decodes that default to
// DefaultUIPreferences(), and -- critically -- preserves pre-existing
// scalar settings that migrateV16ToV17 never touches.
func TestMigrationV16ToV17(t *testing.T) {
	tmpDir := t.TempDir()
	s := Store{DBPath: filepath.Join(tmpDir, "db.sqlite")}
	defer s.Close()

	conn, err := sql.Open("sqlite3", s.DBPath+"?_foreign_keys=on&_journal_mode=WAL")
	if err != nil {
		t.Fatal(err)
	}
	if err := conn.Ping(); err != nil {
		conn.Close()
		t.Fatal(err)
	}
	s.db = &database{conn: conn}

	if _, err := s.db.conn.Exec(v16Schema); err != nil {
		t.Fatalf("failed to create v16 schema: %v", err)
	}

	version, err := s.db.getSchemaVersion()
	if err != nil {
		t.Fatalf("failed to get schema version: %v", err)
	}
	if version != 16 {
		t.Fatalf("expected schema version 16 before migration, got %d", version)
	}

	// Seed a scalar value that migrateV16ToV17 has no business touching, so
	// we can prove afterward that it survived.
	const wantSelectedModel = "llama3.2"
	const wantContextLength = 8192
	if _, err := s.db.conn.Exec(
		`UPDATE settings SET selected_model = ?, context_length = ?`,
		wantSelectedModel, wantContextLength,
	); err != nil {
		t.Fatalf("failed to seed pre-migration scalar values: %v", err)
	}

	if err := s.db.migrate(); err != nil {
		t.Fatalf("migrate() failed: %v", err)
	}

	version, err = s.db.getSchemaVersion()
	if err != nil {
		t.Fatalf("failed to get schema version after migration: %v", err)
	}
	if version != currentSchemaVersion {
		t.Fatalf("expected schema version %d after migration, got %d", currentSchemaVersion, version)
	}

	// The ui_preferences column must exist and default to '' for a row that
	// existed before the migration ran.
	var uiPreferencesBlob string
	if err := s.db.conn.QueryRow(`SELECT ui_preferences FROM settings`).Scan(&uiPreferencesBlob); err != nil {
		t.Fatalf("ui_preferences column missing or unreadable after migration: %v", err)
	}
	if uiPreferencesBlob != "" {
		t.Fatalf("expected ui_preferences to default to '', got %q", uiPreferencesBlob)
	}

	// An empty blob must decode to exactly DefaultUIPreferences() -- this is
	// the "never returns an error, never bricks the app on launch" contract
	// decodeUIPreferences exists to guarantee.
	got := decodeUIPreferences(uiPreferencesBlob)
	want := DefaultUIPreferences()
	gotJSON, _ := json.Marshal(got)
	wantJSON, _ := json.Marshal(want)
	if string(gotJSON) != string(wantJSON) {
		t.Fatalf("decodeUIPreferences(\"\") = %s, want %s", gotJSON, wantJSON)
	}

	// The full getSettings/setSettings round trip must also see the
	// migrated column (this exercises schema site (d) from the task, not
	// just a raw column read).
	settings, err := s.db.getSettings()
	if err != nil {
		t.Fatalf("getSettings() failed after migration: %v", err)
	}
	if settings.SelectedModel != wantSelectedModel {
		t.Fatalf("expected selected_model %q to survive migration, got %q", wantSelectedModel, settings.SelectedModel)
	}
	if settings.ContextLength != wantContextLength {
		t.Fatalf("expected context_length %d to survive migration, got %d", wantContextLength, settings.ContextLength)
	}
	settingsUIJSON, _ := json.Marshal(settings.UIPreferences)
	if string(settingsUIJSON) != string(wantJSON) {
		t.Fatalf("getSettings().UIPreferences = %s, want default %s", settingsUIJSON, wantJSON)
	}

	// Round-trip a real save through setSettings/getSettings to prove
	// encodeUIPreferences and decodeUIPreferences agree with each other, not
	// just that both independently produce plausible output.
	settings.UIPreferences.LangMode = "both"
	settings.UIPreferences.FunnyEn = 3
	settings.UIPreferences.School.PinSet = true
	if err := s.db.setSettings(settings); err != nil {
		t.Fatalf("setSettings() failed: %v", err)
	}

	roundTripped, err := s.db.getSettings()
	if err != nil {
		t.Fatalf("getSettings() failed after setSettings(): %v", err)
	}
	if roundTripped.UIPreferences.LangMode != "both" {
		t.Fatalf("expected LangMode %q to round-trip, got %q", "both", roundTripped.UIPreferences.LangMode)
	}
	if roundTripped.UIPreferences.FunnyEn != 3 {
		t.Fatalf("expected FunnyEn 3 to round-trip, got %d", roundTripped.UIPreferences.FunnyEn)
	}
	if !roundTripped.UIPreferences.School.PinSet {
		t.Fatal("expected School.PinSet to round-trip as true")
	}
	// The scalar seeded before migration must still survive an unrelated
	// UIPreferences-only change, proving setSettings' new ui_preferences
	// argument didn't shift any other positional parameter out of place.
	if roundTripped.SelectedModel != wantSelectedModel {
		t.Fatalf("expected selected_model %q to survive an unrelated UIPreferences save, got %q", wantSelectedModel, roundTripped.SelectedModel)
	}
}

func uint64Ptr(v uint64) *uint64 { return &v }

// TestExportContainsNoSecrets proves that marshaling a fully-populated
// Settings value -- exactly what a settings export or a GET /api/v1/settings
// response would produce -- never contains a raw secret. Only *Set booleans
// (SchoolPrefs.PinSet, Endpoint.TokenSet) may appear; the PIN and any
// endpoint token themselves must live exclusively in SecretStore, never as
// fields on Settings or UIPreferences.
func TestExportContainsNoSecrets(t *testing.T) {
	ramBytes := uint64Ptr(16 * 1024 * 1024 * 1024)

	settings := Settings{
		Expose:            true,
		Survey:            true,
		Browser:           true,
		Models:            "llama3.2",
		Agent:             true,
		Tools:             true,
		WorkingDir:        "/tmp/work",
		ContextLength:     8192,
		TurboEnabled:      true,
		WebSearchEnabled:  true,
		ThinkEnabled:      true,
		ThinkLevel:        "high",
		SelectedModel:     "llama3.2",
		SidebarOpen:       true,
		LastHomeView:      "chat",
		AutoUpdateEnabled: true,
		UIPreferences: UIPreferences{
			Version:  uiPreferencesVersion,
			LangMode: "both",
			FunnyEn:  3,
			FunnyYue: 4,
			Emoji:    true,
			School: SchoolPrefs{
				On:     true,
				Name:   "Study Mode",
				PinSet: true,
			},
			Narration: NarrationPrefs{
				On:    true,
				Lang:  "yue",
				Voice: "hk-female-1",
				Rate:  1.2,
			},
			Appearance: AppearancePrefs{
				Seed:    "#7C4DFF",
				Theme:   "dark",
				Density: "comfortable",
				Radius:  16,
				AppName: "Material Ollama",
				Glyph:   "\U0001F999", // llama emoji
				Overrides: map[string]string{
					"--md-sys-color-primary": "#7C4DFF",
				},
			},
			Vocab:     []VocabRule{{Find: "worktree", Repl: "Gerk Tong Hui"}},
			Schedules: []ScheduleRule{{Time: "22:00", Kind: "dim"}},
			Hardware: map[string]HardwareOverrides{
				"endpoint-1": {
					RAMBytes: ramBytes,
					Note:     "manually measured",
				},
			},
			Endpoints: EndpointPrefs{
				ActiveID: "endpoint-1",
				Endpoints: []Endpoint{
					{
						ID:       "endpoint-1",
						Kind:     "ollama",
						Label:    "Home Rig",
						BaseURL:  "http://192.168.1.50:11434",
						TokenSet: true,
					},
				},
			},
		},
	}

	b, err := json.Marshal(settings)
	if err != nil {
		t.Fatalf("marshal settings: %v", err)
	}

	// A raw "pin" (or "token") key would mean a secret value leaked onto
	// Settings/UIPreferences; only the "...Set" boolean siblings are allowed.
	if pat := regexp.MustCompile(`"pin"\s*:`); pat.Match(b) {
		t.Fatalf("exported settings JSON contains a raw \"pin\" key: %s", b)
	}
	if pat := regexp.MustCompile(`"token"\s*:`); pat.Match(b) {
		t.Fatalf("exported settings JSON contains a raw \"token\" key: %s", b)
	}

	// Sanity-check the positive side too: the *Set booleans we DO expect
	// must actually be present and true, or the negative checks above would
	// be vacuously true because nothing PIN/token-shaped was exported at all.
	if pat := regexp.MustCompile(`"pinSet"\s*:\s*true`); !pat.Match(b) {
		t.Fatalf("expected pinSet:true in exported settings JSON, got: %s", b)
	}
	if pat := regexp.MustCompile(`"tokenSet"\s*:\s*true`); !pat.Match(b) {
		t.Fatalf("expected tokenSet:true in exported settings JSON, got: %s", b)
	}
}
