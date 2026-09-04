//go:build windows || darwin

package store

import (
	"database/sql"
	"path/filepath"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

// A real install reached this exact state and every settings read failed with
// "no such column: ui_preferences", so the whole app rendered an error boundary
// instead of a UI (app.log, 0.0.0-build.21).
//
// It got there because upstream and this fork each shipped a v17 and a v18 that
// added DIFFERENT columns. A database that ran one build and then the other
// ends up at version 18 holding app_events (this fork's v18) and
// onboarding_version (upstream's v17) but NOT ui_preferences (this fork's v17)
// -- and the migration that would have added it is already behind it, so no
// amount of upgrading ever repairs it.
//
// Renumbering the migrations fixes the collision going forward. It does nothing
// for a database that already took the mixed path, which is why the schema
// reconciles its columns against what the code actually reads.
func openMixedPathDatabase(t *testing.T, path string) *database {
	t.Helper()
	conn, err := sql.Open("sqlite3", path)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	// The columns the settings reader needs, minus ui_preferences, plus
	// upstream's onboarding_version -- exactly the shape observed in the wild.
	_, err = conn.Exec(`
		CREATE TABLE settings (
			id INTEGER PRIMARY KEY,
			expose BOOLEAN NOT NULL DEFAULT 0,
			survey BOOLEAN NOT NULL DEFAULT 0,
			browser BOOLEAN NOT NULL DEFAULT 0,
			models TEXT NOT NULL DEFAULT '',
			agent BOOLEAN NOT NULL DEFAULT 0,
			tools BOOLEAN NOT NULL DEFAULT 0,
			working_dir TEXT NOT NULL DEFAULT '',
			context_length INTEGER NOT NULL DEFAULT 0,
			turbo_enabled BOOLEAN NOT NULL DEFAULT 0,
			websearch_enabled BOOLEAN NOT NULL DEFAULT 0,
			selected_model TEXT NOT NULL DEFAULT '',
			sidebar_open BOOLEAN NOT NULL DEFAULT 1,
			last_home_view TEXT NOT NULL DEFAULT '',
			think_enabled BOOLEAN NOT NULL DEFAULT 0,
			think_level TEXT NOT NULL DEFAULT '',
			auto_update_enabled BOOLEAN NOT NULL DEFAULT 1,
			onboarding_version INTEGER NOT NULL DEFAULT 0,
			schema_version INTEGER NOT NULL DEFAULT 18
		);
		INSERT INTO settings (id) VALUES (1);
	`)
	if err != nil {
		t.Fatalf("create mixed-path schema: %v", err)
	}
	return &database{conn: conn}
}

func settingsColumns(t *testing.T, db *database) map[string]bool {
	t.Helper()
	rows, err := db.conn.Query(`PRAGMA table_info(settings)`)
	if err != nil {
		t.Fatalf("table_info: %v", err)
	}
	defer rows.Close()
	found := map[string]bool{}
	for rows.Next() {
		var cid, notNull, pk int
		var name, colType string
		var dflt any
		if err := rows.Scan(&cid, &name, &colType, &notNull, &dflt, &pk); err != nil {
			t.Fatalf("scan: %v", err)
		}
		found[name] = true
	}
	return found
}

func TestReconcileSettingsColumnsRepairsAMixedPathDatabase(t *testing.T) {
	db := openMixedPathDatabase(t, filepath.Join(t.TempDir(), "mixed.db"))
	defer db.conn.Close()

	before := settingsColumns(t, db)
	if before["ui_preferences"] {
		t.Fatal("fixture is wrong: it must start WITHOUT ui_preferences, or this proves nothing")
	}
	if !before["onboarding_version"] {
		t.Fatal("fixture is wrong: it must start WITH onboarding_version to reproduce the mixed path")
	}

	// Migrating alone must NOT be enough. If this ever starts adding the
	// column, the reconciliation below is no longer what repairs the database
	// and this test has stopped testing the thing it was written for.
	if err := db.migrate(); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if settingsColumns(t, db)["ui_preferences"] {
		t.Fatal("migrate() added ui_preferences on a version-18 database; the mixed-path fixture no longer reproduces the defect")
	}

	if err := db.reconcileSettingsColumns(); err != nil {
		t.Fatalf("reconcileSettingsColumns: %v", err)
	}

	after := settingsColumns(t, db)
	for _, want := range []string{"ui_preferences", "onboarding_version", "claude_desktop_used"} {
		if !after[want] {
			t.Fatalf("settings still missing %q after reconciliation", want)
		}
	}

	// And the read that was failing must now work.
	if _, err := db.getSettings(); err != nil {
		t.Fatalf("getSettings still fails after reconciliation: %v", err)
	}
}

func TestReconcileSettingsColumnsIsIdempotent(t *testing.T) {
	db := openMixedPathDatabase(t, filepath.Join(t.TempDir(), "twice.db"))
	defer db.conn.Close()

	for i := range 3 {
		if err := db.reconcileSettingsColumns(); err != nil {
			t.Fatalf("reconcileSettingsColumns run %d: %v", i+1, err)
		}
	}
	if _, err := db.getSettings(); err != nil {
		t.Fatalf("getSettings after repeated reconciliation: %v", err)
	}
}

func TestReconcileSettingsColumnsCoversEveryColumnTheReaderNeeds(t *testing.T) {
	// A hand-written check that the reconciliation list has not drifted from
	// the columns getSettings actually selects. A rule-shaped test that only
	// validates the entries already present would pass on an empty list.
	needed := []string{"ui_preferences", "onboarding_version", "claude_desktop_used"}
	declared := map[string]bool{}
	for _, c := range expectedSettingsColumns {
		declared[c.name] = true
	}
	for _, name := range needed {
		if !declared[name] {
			t.Fatalf("expectedSettingsColumns is missing %q, so a database without it can never self-heal", name)
		}
	}
}
