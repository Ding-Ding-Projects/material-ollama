package server

import (
	"archive/zip"
	"bytes"
	"errors"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/ollama/ollama/api"
)

func createZipFile(t *testing.T, name string) *os.File {
	t.Helper()

	f, err := os.CreateTemp(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}

	zf := zip.NewWriter(f)
	defer zf.Close()

	zh, err := zf.CreateHeader(&zip.FileHeader{Name: name})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := io.Copy(zh, bytes.NewReader([]byte(""))); err != nil {
		t.Fatal(err)
	}

	return f
}

func TestExtractFromZipFile(t *testing.T) {
	cases := []struct {
		name   string
		expect []string
		err    error
	}{
		{
			name:   "good",
			expect: []string{"good"},
		},
		{
			name:   strings.Join([]string{"path", "..", "to", "good"}, string(os.PathSeparator)),
			expect: []string{filepath.Join("to", "good")},
		},
		{
			name:   strings.Join([]string{"path", "..", "to", "..", "good"}, string(os.PathSeparator)),
			expect: []string{"good"},
		},
		{
			name:   strings.Join([]string{"path", "to", "..", "..", "good"}, string(os.PathSeparator)),
			expect: []string{"good"},
		},
		{
			name: strings.Join([]string{"..", "..", "..", "..", "..", "..", "..", "..", "..", "..", "..", "..", "..", "..", "..", "..", "bad"}, string(os.PathSeparator)),
			err:  zip.ErrInsecurePath,
		},
		{
			name: strings.Join([]string{"path", "..", "..", "to", "bad"}, string(os.PathSeparator)),
			err:  zip.ErrInsecurePath,
		},
	}

	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			f := createZipFile(t, tt.name)
			defer f.Close()

			tempDir := t.TempDir()
			if err := extractFromZipFile(tempDir, f, func(api.ProgressResponse) {}); !errors.Is(err, tt.err) {
				t.Fatal(err)
			}

			var matches []string
			if err := filepath.Walk(tempDir, func(p string, fi os.FileInfo, err error) error {
				if err != nil {
					return err
				}

				if !fi.IsDir() {
					matches = append(matches, p)
				}

				return nil
			}); err != nil {
				t.Fatal(err)
			}

			var actual []string
			for _, match := range matches {
				rel, err := filepath.Rel(tempDir, match)
				if err != nil {
					t.Error(err)
				}

				actual = append(actual, rel)
			}

			if !slices.Equal(actual, tt.expect) {
				t.Fatalf("expected %d files, got %d", len(tt.expect), len(matches))
			}
		})
	}
}

func TestAddToolPrefix(t *testing.T) {
	tests := []struct {
		name     string
		template string
		want     string
	}{
		{
			name:     "prefix_from_previous_text_node",
			template: `Previous text node{{- range .ToolCalls}}{{.name}}{{end}}`,
			want:     "Previous text node",
		},
		{
			name:     "prefix_from_range_node",
			template: `{{- range .ToolCalls}}[TOOL_CALLS]{{.name}}{{end}}`,
			want:     "[TOOL_CALLS]",
		},
		{
			name:     "prefix_with_extra_whitespace",
			template: `    Previous text with spaces    {{- range .ToolCalls}}{{.name}}{{end}}`,
			want:     "Previous text with spaces",
		},
		{
			name:     "prefix_with_newlines",
			template: "First line\nSecond line\n{{- range .ToolCalls}}{{.name}}{{end}}",
			want:     "First line\nSecond line",
		},
		{
			name: "tool_calls_json_template",
			template: `{{ if .Content }}{{ .Content }}{{- else if .ToolCalls }}<tool_call>
{{ range .ToolCalls }}{"name": "{{ .Function.Name }}", "arguments": {{ .Function.Arguments }}}{{ end }}</tool_call>
{{ end }}`,
			want: `<tool_call>`,
		},
		{
			name: "mistral_tool_calls_template",
			template: `{{- if .Content }} {{ .Content }}
{{- else if .ToolCalls }}[TOOL_CALLS] [
{{- range .ToolCalls }}{"name": "{{ .Function.Name }}", "arguments": {{ .Function.Arguments }}}
{{- end }}]
{{- end }}</s>`,
			want: "[TOOL_CALLS] [",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tmpl, err := template.Parse(tt.template)
			if err != nil {
				t.Fatalf("failed to parse template: %v", err)
			}

			m := &Model{Template: tmpl}
			m.addToolPrefix()

			if m.ToolPrefix != tt.want {
				t.Errorf("incorrect tool prefix:\ngot:  %q\nwant: %q", m.ToolPrefix, tt.want)
			}
		})
	}
}
