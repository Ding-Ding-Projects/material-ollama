//go:build windows || darwin

package ui

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// --- pdf-operations: convertPDFToText -----------------------------------
//
// convertPDFToText (see convert.go) is, per this project's own
// docs/features/uh-completeness/articles/file-converter.md, the one PDF
// operation this build currently ships -- and per the "pdf-operations"
// suite area's own Notes, it had zero test coverage, "not even a smoke
// test against a minimal real PDF fixture." buildMinimalTextPDF below
// constructs exactly that: a byte-correct, hand-built single-page PDF
// (proper object offsets, a real cross-reference table, a real trailer)
// containing one Tj text-showing operator, fed through the real
// github.com/ledongthuc/pdf reader convertPDFToText itself uses -- never a
// mocked reader.

// pdfObject is one indirect object ("N 0 obj ... endobj") queued for
// buildMinimalTextPDF to write. Building the byte offsets programmatically
// (rather than hard-coding them) is what keeps this fixture correct
// regardless of exactly how long any one object's body ends up being.
type pdfObject struct {
	num  int
	body string
}

// buildMinimalTextPDF returns a complete, spec-valid single-page PDF
// (%PDF-1.4, one Type1/Helvetica font, one content stream drawing `text`
// with a single Tj operator, a byte-exact cross-reference table, and a
// trailer) that github.com/ledongthuc/pdf can open and extract `text`
// back out of via GetPlainText.
func buildMinimalTextPDF(t *testing.T, text string) []byte {
	t.Helper()

	content := fmt.Sprintf("BT /F1 24 Tf 72 712 Td (%s) Tj ET", pdfEscapeString(text))

	objects := []pdfObject{
		{1, "<< /Type /Catalog /Pages 2 0 R >>"},
		{2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"},
		{3, "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>"},
		{4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"},
		{5, fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", len(content)+1, content)},
	}

	var buf bytes.Buffer
	buf.WriteString("%PDF-1.4\n")

	offsets := make([]int, len(objects)+1) // index 0 is the free-list head, unused
	for _, obj := range objects {
		offsets[obj.num] = buf.Len()
		buf.WriteString(fmt.Sprintf("%d 0 obj\n%s\nendobj\n", obj.num, obj.body))
	}

	xrefStart := buf.Len()
	buf.WriteString(fmt.Sprintf("xref\n0 %d\n", len(objects)+1))
	buf.WriteString("0000000000 65535 f \n")
	for i := 1; i <= len(objects); i++ {
		buf.WriteString(fmt.Sprintf("%010d %05d n \n", offsets[i], 0))
	}

	buf.WriteString(fmt.Sprintf("trailer\n<< /Size %d /Root 1 0 R >>\n", len(objects)+1))
	buf.WriteString(fmt.Sprintf("startxref\n%d\n%%%%EOF", xrefStart))

	return buf.Bytes()
}

// pdfEscapeString escapes the handful of characters a PDF literal string
// ("(...)"), must never contain unescaped. The fixed strings this test
// file actually uses never need it, but a fixture generator that silently
// mishandles '(' / ')' / '\' would produce a PDF that is subtly wrong in a
// way no error would surface, so it is handled for real rather than
// assumed away.
func pdfEscapeString(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `(`, `\(`)
	s = strings.ReplaceAll(s, `)`, `\)`)
	return s
}

// openTestPDF writes data to a temp file and returns it opened for
// reading, matching exactly what convertPDFToText's own signature expects
// (an *os.File plus its size, since the underlying library needs
// io.ReaderAt to reach the cross-reference table at the end of the file).
func openTestPDF(t *testing.T, data []byte) (*os.File, int64) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "fixture.pdf")
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatalf("write fixture PDF: %v", err)
	}
	f, err := os.Open(path)
	if err != nil {
		t.Fatalf("open fixture PDF: %v", err)
	}
	t.Cleanup(func() { f.Close() })
	info, err := f.Stat()
	if err != nil {
		t.Fatalf("stat fixture PDF: %v", err)
	}
	return f, info.Size()
}

// TestConvertPDFToText_ExtractsRealTextFromAMinimalRealPDF is the smoke
// test the "pdf-operations" area's Notes name as missing: a genuinely
// well-formed single-page PDF, fed through the real ledongthuc/pdf-backed
// convertPDFToText, must yield the exact text it was built to contain.
func TestConvertPDFToText_ExtractsRealTextFromAMinimalRealPDF(t *testing.T) {
	const want = "Hello Suite Inventory"
	data := buildMinimalTextPDF(t, want)
	f, size := openTestPDF(t, data)

	var out bytes.Buffer
	if err := convertPDFToText(f, size, &out); err != nil {
		t.Fatalf("convertPDFToText: %v", err)
	}

	got := out.String()
	if !strings.Contains(got, want) {
		t.Fatalf("output = %q, want it to contain %q", got, want)
	}
}

// TestConvertPDFToText_RejectsAFileThatIsNotAPDFAtAll proves
// convertPDFToText does not silently succeed (with empty or garbage
// output) on a file that is not a PDF -- pdf.NewReader must fail up front
// on a missing header/xref, and convertPDFToText must propagate that
// error rather than swallowing it.
func TestConvertPDFToText_RejectsAFileThatIsNotAPDFAtAll(t *testing.T) {
	f, size := openTestPDF(t, []byte("this is a plain text file, not a PDF at all\n"))

	var out bytes.Buffer
	err := convertPDFToText(f, size, &out)
	if err == nil {
		t.Fatalf("convertPDFToText accepted a non-PDF file as valid input; wrote %q", out.String())
	}
}

// TestConvertPDFToText_EmptyPageProducesEmptyOutputNotAnError proves a
// structurally valid PDF whose one page has no content stream at all
// still succeeds (per convertPDFToText's own "a single unreadable page
// does not fail the whole document" comment) rather than erroring on the
// absence of extractable text -- an empty PDF page is a legitimate real
// document, not a corrupt one.
func TestConvertPDFToText_EmptyPageProducesEmptyOutputNotAnError(t *testing.T) {
	objects := []pdfObject{
		{1, "<< /Type /Catalog /Pages 2 0 R >>"},
		{2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"},
		{3, "<< /Type /Page /Parent 2 0 R /Resources << >> /MediaBox [0 0 612 792] >>"},
	}
	var buf bytes.Buffer
	buf.WriteString("%PDF-1.4\n")
	offsets := make([]int, len(objects)+1)
	for _, obj := range objects {
		offsets[obj.num] = buf.Len()
		buf.WriteString(fmt.Sprintf("%d 0 obj\n%s\nendobj\n", obj.num, obj.body))
	}
	xrefStart := buf.Len()
	buf.WriteString(fmt.Sprintf("xref\n0 %d\n", len(objects)+1))
	buf.WriteString("0000000000 65535 f \n")
	for i := 1; i <= len(objects); i++ {
		buf.WriteString(fmt.Sprintf("%010d %05d n \n", offsets[i], 0))
	}
	buf.WriteString(fmt.Sprintf("trailer\n<< /Size %d /Root 1 0 R >>\n", len(objects)+1))
	buf.WriteString(fmt.Sprintf("startxref\n%d\n%%%%EOF", xrefStart))

	f, size := openTestPDF(t, buf.Bytes())

	var out bytes.Buffer
	if err := convertPDFToText(f, size, &out); err != nil {
		t.Fatalf("convertPDFToText on a contentless page: %v", err)
	}
	if got := strings.TrimSpace(out.String()); got != "" {
		t.Fatalf("output = %q, want empty for a page with no content stream", got)
	}
}
