package store

import (
	"encoding/json"
	"strings"
	"testing"
)

// A nil Go slice marshals to JSON null, not []. The renderer reads .length off
// these arrays, so null crashes the Settings route. Defaults must emit [].
func TestDefaultUIPreferencesEmitsArraysNotNull(t *testing.T) {
	b, err := json.Marshal(DefaultUIPreferences())
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	got := string(b)
	for _, bad := range []string{`"vocab":null`, `"schedules":null`, `"endpoints":null`} {
		if strings.Contains(got, bad) {
			t.Errorf("found %s - a nil slice reached the renderer as null", bad)
		}
	}
}
