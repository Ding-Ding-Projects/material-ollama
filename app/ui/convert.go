//go:build windows || darwin

// File converter: catalog, real in-process adapters, and a persisted,
// bounded-concurrency job queue.
//
// The pipeline every job goes through, in order, is: probe (byte
// signature, not extension) -> disclose the real loss report and require
// an acknowledgement -> preflight (destination free space, input size cap)
// -> convert (streaming; images are the one documented exception, since
// decoding necessarily holds one full frame in memory) -> validate the
// output by re-reading it with the same rules a consumer would use ->
// atomic rename from a temp file that already lives on the destination
// volume. A job that fails validation is failed and its temp output is
// deleted -- the user is never handed a broken file.
//
// "Available" in the catalog means the adapter genuinely converts offline
// right now, with no PATH discovery: anything backed by an external tool
// resolves only under filepath.Dir(os.Executable())+"/lib/converters/",
// exactly like app/server/server.go's resolvePath. When that binary is
// absent -- which it is in this build; audio, video, Documents (docx/
// xlsx/pptx conversion) and modern-image encode (webp/avif/heic) all ship
// disabled -- the format is still listed, just disabled, with the exact
// missing dependency and the exact path it was looked for at.
//
// Isolation is a bounded child process, not a sandbox: a per-job context
// deadline, a hard cap on bytes the child may write, and on Windows a Job
// Object (see convert_windows.go) that kills the whole process tree the
// instant the job's handle closes. No adapter in this build actually
// spawns a child process -- every one of them is in-process Go -- so this
// machinery exists for the external-tool adapters this catalog already
// knows how to describe once someone ships a binary into lib/converters.
package ui

import (
	"archive/tar"
	"archive/zip"
	"bufio"
	"compress/gzip"
	"context"
	"encoding/base32"
	"encoding/base64"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"image"
	"image/gif"
	"image/jpeg"
	"image/png"
	"io"
	"io/fs"
	"mime/quotedprintable"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/gabriel-vasile/mimetype"
	"github.com/google/uuid"
	"github.com/klauspost/compress/zstd"
	"github.com/ledongthuc/pdf"
	"github.com/ollama/ollama/format"
	"github.com/pelletier/go-toml/v2"
	"golang.org/x/image/bmp"
	"golang.org/x/image/tiff"
	"golang.org/x/image/webp"
	"golang.org/x/text/encoding"
	"golang.org/x/text/encoding/charmap"
	"golang.org/x/text/encoding/unicode"
	"golang.org/x/text/transform"
	"gopkg.in/yaml.v3"
)

// ============================================================================
// Catalog
// ============================================================================

// ConvertFormat is one entry in the catalog: a format the converter knows
// about, whether it is genuinely usable offline right now, and -- when it
// is not -- exactly why not.
type ConvertFormat struct {
	ID                string   `json:"id"`
	Label             string   `json:"label"`
	Extensions        []string `json:"extensions"`
	MimeTypes         []string `json:"mimeTypes,omitempty"`
	Available         bool     `json:"available"`
	MissingDependency string   `json:"missingDependency,omitempty"`
	ExpectedPath      string   `json:"expectedPath,omitempty"`
	// LossyTo lists target format IDs for which converting FROM this
	// format is known to lose information (dropped metadata, narrower
	// charset, lossy recompression, ...). It is the coarse, catalog-level
	// summary; the per-job /probe and job-creation responses compute a
	// specific LossReport with human-readable reasons for the exact pair
	// requested.
	LossyTo []string `json:"lossyTo,omitempty"`
	// tool is the external binary name this format is backed by, when it
	// is not an in-process adapter. Unexported (never serialized): it is
	// only ever consulted by externalAdapterConvert, from the same
	// findFormat lookup that already knows Available/ExpectedPath, so the
	// external-tool name can never drift out of step with the catalog.
	tool string
}

// ConvertCategory groups related formats the way the converter UI presents
// them: Documents/PDF, Images, Audio, Video, Archives, Structured Data,
// Code/Text, Binary Encodings.
type ConvertCategory struct {
	ID      string          `json:"id"`
	Label   string          `json:"label"`
	Formats []ConvertFormat `json:"formats"`
}

// externalConverterDir resolves the directory external converter binaries
// must live in, next to the running executable. This mirrors
// app/server/server.go's resolvePath exactly: no PATH discovery, ever.
func externalConverterDir() string {
	exe, err := os.Executable()
	if err != nil || exe == "" {
		return filepath.Join("lib", "converters")
	}
	return filepath.Join(filepath.Dir(exe), "lib", "converters")
}

// externalTool reports the expected absolute path for an external
// converter binary (named without extension) and whether it is currently
// present and usable offline. It never consults PATH.
func externalTool(name string) (path string, available bool) {
	base := name
	if runtime.GOOS == "windows" {
		base += ".exe"
	}
	p := filepath.Join(externalConverterDir(), base)
	info, err := os.Stat(p)
	return p, err == nil && !info.IsDir()
}

// externalFormat builds a catalog entry for a format whose conversion is
// backed by an external tool. It is disabled -- with the exact missing
// dependency and expected path -- unless that tool is genuinely present.
func externalFormat(id, label, tool string, extensions, mimeTypes, lossyTo []string) ConvertFormat {
	path, available := externalTool(tool)
	f := ConvertFormat{
		ID:         id,
		Label:      label,
		Extensions: extensions,
		MimeTypes:  mimeTypes,
		Available:  available,
		LossyTo:    lossyTo,
		tool:       tool,
	}
	if !available {
		f.MissingDependency = tool
		f.ExpectedPath = path
	}
	return f
}

// convertCatalog builds the full, honest catalog. Every "available: true"
// entry below is backed by a real adapter registered in convertRunners;
// every "available: false" entry names the exact external tool and path
// this build looked for and did not find.
func convertCatalog() []ConvertCategory {
	structuredIDs := []string{"json", "yaml", "toml", "csv", "xml"}
	return []ConvertCategory{
		{
			ID:    "documents",
			Label: "Documents/PDF",
			Formats: []ConvertFormat{
				{ID: "pdf", Label: "PDF (text extraction only)", Extensions: []string{".pdf"}, MimeTypes: []string{"application/pdf"}, Available: true, LossyTo: []string{"txt"}},
				{ID: "txt", Label: "Plain text (UTF-8)", Extensions: []string{".txt"}, MimeTypes: []string{"text/plain"}, Available: true},
				externalFormat("docx", "Word document (.docx)", "pandoc", []string{".docx"}, []string{"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}, nil),
				externalFormat("xlsx", "Excel workbook (.xlsx)", "pandoc", []string{".xlsx"}, []string{"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}, nil),
				externalFormat("pptx", "PowerPoint deck (.pptx)", "pandoc", []string{".pptx"}, []string{"application/vnd.openxmlformats-officedocument.presentationml.presentation"}, nil),
			},
		},
		{
			ID:    "images",
			Label: "Images",
			Formats: []ConvertFormat{
				{ID: "png", Label: "PNG", Extensions: []string{".png"}, MimeTypes: []string{"image/png"}, Available: true},
				{ID: "jpeg", Label: "JPEG", Extensions: []string{".jpg", ".jpeg"}, MimeTypes: []string{"image/jpeg"}, Available: true, LossyTo: []string{"png", "gif", "bmp", "tiff", "jpeg", "webp"}},
				{ID: "gif", Label: "GIF", Extensions: []string{".gif"}, MimeTypes: []string{"image/gif"}, Available: true, LossyTo: []string{"png", "jpeg", "bmp", "tiff", "gif", "webp"}},
				{ID: "bmp", Label: "BMP", Extensions: []string{".bmp"}, MimeTypes: []string{"image/bmp"}, Available: true},
				{ID: "tiff", Label: "TIFF", Extensions: []string{".tif", ".tiff"}, MimeTypes: []string{"image/tiff"}, Available: true},
				{ID: "webp", Label: "WebP (decode only, no offline encoder)", Extensions: []string{".webp"}, MimeTypes: []string{"image/webp"}, Available: true},
				externalFormat("avif", "AVIF", "libavif", []string{".avif"}, []string{"image/avif"}, nil),
				externalFormat("heic", "HEIC", "libheif", []string{".heic"}, []string{"image/heic"}, nil),
			},
		},
		{
			ID:    "audio",
			Label: "Audio",
			Formats: []ConvertFormat{
				externalFormat("mp3", "MP3", "ffmpeg", []string{".mp3"}, []string{"audio/mpeg"}, nil),
				externalFormat("wav", "WAV", "ffmpeg", []string{".wav"}, []string{"audio/wav"}, nil),
				externalFormat("flac", "FLAC", "ffmpeg", []string{".flac"}, []string{"audio/flac"}, nil),
				externalFormat("aac", "AAC", "ffmpeg", []string{".aac"}, []string{"audio/aac"}, nil),
				externalFormat("ogg", "Ogg Vorbis", "ffmpeg", []string{".ogg"}, []string{"audio/ogg"}, nil),
				externalFormat("m4a", "M4A", "ffmpeg", []string{".m4a"}, []string{"audio/mp4"}, nil),
			},
		},
		{
			ID:    "video",
			Label: "Video",
			Formats: []ConvertFormat{
				externalFormat("mp4", "MP4", "ffmpeg", []string{".mp4"}, []string{"video/mp4"}, nil),
				externalFormat("mov", "QuickTime (.mov)", "ffmpeg", []string{".mov"}, []string{"video/quicktime"}, nil),
				externalFormat("webm", "WebM", "ffmpeg", []string{".webm"}, []string{"video/webm"}, nil),
				externalFormat("mkv", "Matroska (.mkv)", "ffmpeg", []string{".mkv"}, []string{"video/x-matroska"}, nil),
				externalFormat("avi", "AVI", "ffmpeg", []string{".avi"}, []string{"video/x-msvideo"}, nil),
			},
		},
		{
			ID:    "archives",
			Label: "Archives",
			Formats: []ConvertFormat{
				{ID: "zip", Label: "ZIP", Extensions: []string{".zip"}, MimeTypes: []string{"application/zip"}, Available: true},
				{ID: "tar", Label: "tar", Extensions: []string{".tar"}, MimeTypes: []string{"application/x-tar"}, Available: true, LossyTo: []string{"zip"}},
				{ID: "tar.gz", Label: "tar.gz", Extensions: []string{".tar.gz", ".tgz"}, MimeTypes: []string{"application/gzip"}, Available: true, LossyTo: []string{"zip"}},
				{ID: "tar.zst", Label: "tar.zst", Extensions: []string{".tar.zst", ".tzst"}, MimeTypes: []string{"application/zstd"}, Available: true, LossyTo: []string{"zip"}},
			},
		},
		{
			ID:    "structured",
			Label: "Structured Data",
			Formats: []ConvertFormat{
				{ID: "json", Label: "JSON", Extensions: []string{".json"}, MimeTypes: []string{"application/json"}, Available: true, LossyTo: []string{"csv", "toml", "xml"}},
				{ID: "yaml", Label: "YAML", Extensions: []string{".yaml", ".yml"}, MimeTypes: []string{"application/yaml", "text/yaml"}, Available: true, LossyTo: subtractOne(structuredIDs, "yaml")},
				{ID: "toml", Label: "TOML", Extensions: []string{".toml"}, MimeTypes: []string{"application/toml"}, Available: true, LossyTo: []string{"csv", "xml"}},
				{ID: "csv", Label: "CSV", Extensions: []string{".csv"}, MimeTypes: []string{"text/csv"}, Available: true, LossyTo: subtractOne(structuredIDs, "csv")},
				{ID: "xml", Label: "XML", Extensions: []string{".xml"}, MimeTypes: []string{"application/xml", "text/xml"}, Available: true, LossyTo: subtractOne(structuredIDs, "xml")},
			},
		},
		{
			ID:    "text",
			Label: "Code/Text",
			Formats: []ConvertFormat{
				{ID: "utf8", Label: "UTF-8 (LF line endings)", Extensions: []string{".txt"}, MimeTypes: []string{"text/plain"}, Available: true},
				{ID: "utf8-crlf", Label: "UTF-8 (CRLF line endings)", Extensions: []string{".txt"}, MimeTypes: []string{"text/plain"}, Available: true},
				{ID: "utf16le", Label: "UTF-16LE", Extensions: []string{".txt"}, Available: true},
				{ID: "utf16be", Label: "UTF-16BE", Extensions: []string{".txt"}, Available: true},
				{ID: "latin1", Label: "ISO-8859-1 (Latin-1)", Extensions: []string{".txt"}, Available: true, LossyTo: []string{"latin1", "windows1252"}},
				{ID: "windows1252", Label: "Windows-1252", Extensions: []string{".txt"}, Available: true, LossyTo: []string{"latin1", "windows1252"}},
			},
		},
		{
			ID:    "binary",
			Label: "Binary Encodings",
			Formats: []ConvertFormat{
				{ID: "raw", Label: "Raw bytes", Available: true},
				{ID: "base64", Label: "Base64", Extensions: []string{".b64"}, Available: true},
				{ID: "base32", Label: "Base32", Extensions: []string{".b32"}, Available: true},
				{ID: "hex", Label: "Hex", Extensions: []string{".hex"}, Available: true},
				{ID: "quoted-printable", Label: "Quoted-printable", Extensions: []string{".qp"}, Available: true},
			},
		},
	}
}

func subtractOne(ids []string, exclude string) []string {
	out := make([]string, 0, len(ids)-1)
	for _, id := range ids {
		if id != exclude {
			out = append(out, id)
		}
	}
	return out
}

// findFormat looks up a format by ID across the whole catalog.
func findFormat(id string) (ConvertFormat, bool) {
	for _, category := range convertCatalog() {
		for _, format := range category.Formats {
			if format.ID == id {
				return format, true
			}
		}
	}
	return ConvertFormat{}, false
}

// categoryOf returns the category ID a format belongs to, used to decide
// which family of loss rules and converters applies to a pair.
func categoryOf(formatID string) string {
	for _, category := range convertCatalog() {
		for _, format := range category.Formats {
			if format.ID == formatID {
				return category.ID
			}
		}
	}
	return ""
}

// ============================================================================
// Probe: byte signature, not extension
// ============================================================================

// extensionFormatIndex maps a lowercase declared file extension (including
// the leading dot, or a compound like ".tar.gz") to a catalog format ID.
// Built once from the catalog itself so it can never drift from it.
func extensionFormatIndex() map[string]string {
	idx := make(map[string]string)
	for _, category := range convertCatalog() {
		for _, format := range category.Formats {
			for _, ext := range format.Extensions {
				ext = strings.ToLower(ext)
				// Don't let a later, less-specific format steal an
				// extension a more specific one already claimed (".txt"
				// is claimed by several Code/Text variants; the first
				// one registered -- plain UTF-8 -- wins as the default
				// guess, which is the sane default guess).
				if _, exists := idx[ext]; !exists {
					idx[ext] = format.ID
				}
			}
		}
	}
	return idx
}

// mimeFormatIndex maps a detected MIME type string to a catalog format ID,
// for the formats whose byte signature is genuinely detectable (binary
// containers and images; JSON/YAML/TOML/CSV/plain text are not reliably
// distinguishable by magic bytes alone, so they are deliberately absent
// here and fall back to the declared extension).
var mimeFormatIndex = map[string]string{
	"application/zip":    "zip",
	"application/x-tar":  "tar",
	"application/gzip":   "tar.gz",
	"application/x-gzip": "tar.gz",
	"application/zstd":   "tar.zst",
	"image/png":          "png",
	"image/jpeg":         "jpeg",
	"image/gif":          "gif",
	"image/bmp":          "bmp",
	"image/tiff":         "tiff",
	"image/webp":         "webp",
	"application/pdf":    "pdf",
	"application/json":   "json",
	"application/xml":    "xml",
	"text/xml":           "xml",
}

// declaredExtensionOf returns the longest matching known extension for a
// filename (so "archive.tar.gz" resolves to "tar.gz" rather than the
// unhelpful, mismatched "gz").
func declaredExtensionOf(filename string) string {
	lower := strings.ToLower(filename)
	idx := extensionFormatIndex()
	best := ""
	for ext := range idx {
		if strings.HasSuffix(lower, ext) && len(ext) > len(best) {
			best = ext
		}
	}
	if best != "" {
		return best
	}
	return strings.ToLower(filepath.Ext(filename))
}

// ConvertProbeResult is the honest, byte-signature-first answer to "what
// is this file, and does the declared extension agree?"
type ConvertProbeResult struct {
	Path              string `json:"path"`
	Filename          string `json:"filename"`
	SizeBytes         int64  `json:"sizeBytes"`
	DetectedMimeType  string `json:"detectedMimeType,omitempty"`
	DetectedFormat    string `json:"detectedFormat,omitempty"`
	DeclaredExtension string `json:"declaredExtension,omitempty"`
	DeclaredFormat    string `json:"declaredFormat,omitempty"`
	// SourceFormat is the format probe recommends treating the file as:
	// the detected format when the byte signature yielded one, else the
	// declared-extension guess.
	SourceFormat string   `json:"sourceFormat,omitempty"`
	Mismatch     bool     `json:"mismatch"`
	Warnings     []string `json:"warnings,omitempty"`
	// LossReport is populated only when the request named a targetFormat:
	// this is the one place the frontend can see the exact disclosure for
	// a chosen src/dst pair BEFORE attempting to create the job, since
	// job creation itself rejects a lossy conversion that has not been
	// acknowledged rather than silently proceeding.
	LossReport *ConvertLossReport `json:"lossReport,omitempty"`
}

// probeFile reads only the first 3KB of path (mimetype.DetectReader's own
// bounded read) to determine its real type by byte signature, then
// reconciles that against the declared filename extension. path must
// already have passed the picker-issued path check; this function does no
// authorization of its own.
func probeFile(path string) (ConvertProbeResult, error) {
	info, err := os.Stat(path)
	if err != nil {
		return ConvertProbeResult{}, fmt.Errorf("cannot access %q: %w", path, err)
	}
	if info.IsDir() {
		return ConvertProbeResult{}, fmt.Errorf("%q is a directory, not a file", path)
	}

	f, err := os.Open(path)
	if err != nil {
		return ConvertProbeResult{}, fmt.Errorf("open %q: %w", path, err)
	}
	defer f.Close()

	// mimetype.DetectReader itself only ever reads a bounded header (the
	// library's own internal limit, currently 3072 bytes) regardless of
	// how large the underlying reader is -- it never reads the whole file.
	mt, err := mimetype.DetectReader(f)

	result := ConvertProbeResult{
		Path:      path,
		Filename:  filepath.Base(path),
		SizeBytes: info.Size(),
	}
	if err == nil && mt != nil {
		result.DetectedMimeType = mt.String()
		result.DetectedFormat = mimeFormatIndex[mt.String()]
	}

	declaredExt := declaredExtensionOf(result.Filename)
	result.DeclaredExtension = declaredExt
	result.DeclaredFormat = extensionFormatIndex()[declaredExt]

	switch {
	case result.DetectedFormat != "" && result.DeclaredFormat != "" && result.DetectedFormat != result.DeclaredFormat:
		result.Mismatch = true
		result.SourceFormat = result.DetectedFormat
		declaredLabel := result.DeclaredExtension
		if declaredLabel == "" {
			declaredLabel = "(none)"
		}
		result.Warnings = append(result.Warnings, fmt.Sprintf(
			"Detected %s; the extension says %s. Using the detected type.",
			result.DetectedMimeType, declaredLabel,
		))
	case result.DetectedFormat != "":
		result.SourceFormat = result.DetectedFormat
	case result.DeclaredFormat != "":
		result.SourceFormat = result.DeclaredFormat
	default:
		result.Warnings = append(result.Warnings, "Could not determine this file's format from its contents or its extension; specify sourceFormat explicitly.")
	}

	return result, nil
}

// ============================================================================
// Loss report: disclose before running
// ============================================================================

// ConvertLossReport is what convert/probe and convert/jobs disclose about
// one specific src->dst pair before a job is allowed to run. A job request
// with Lossy true must carry an explicit AcknowledgeLossy flag, checked in
// createConvertJob.
type ConvertLossReport struct {
	Lossy        bool     `json:"lossy"`
	Irreversible bool     `json:"irreversible"`
	Reasons      []string `json:"reasons,omitempty"`
}

// lossReportFor computes the disclosure for converting src -> dst. It is
// deliberately static per format pair (not a function of the file's actual
// content) so the same pair always discloses the same thing -- a user who
// has seen the warning once knows exactly what it means the next time.
func lossReportFor(src, dst string) ConvertLossReport {
	// Deliberately NOT short-circuited on src == dst: re-encoding a file
	// through its own format is not automatically an identity operation.
	// A JPEG re-saved as JPEG is recompressed (genuinely lossy); YAML
	// re-saved as YAML still drops comments and anchors on the way
	// through this build's decode/encode round trip. Every category
	// function below is written to give the right answer whether src and
	// dst are equal or not, rather than papering over the distinction.
	srcCat, dstCat := categoryOf(src), categoryOf(dst)

	switch {
	case src == dst && srcCat == "" && dstCat == "":
		// Neither format resolved to a known category (should not
		// happen for anything already validated against the catalog,
		// but this keeps an unrecognized-but-identical pair from
		// reaching the alarming "not understood losslessly" fallback
		// below for what is, at minimum, a no-op).
		return ConvertLossReport{}

	case src == "pdf" && dst == "txt":
		return ConvertLossReport{
			Lossy: true, Irreversible: true,
			Reasons: []string{"PDF -> txt discards layout, images and formatting."},
		}

	case srcCat == "structured" && dstCat == "structured":
		return structuredLossReport(src, dst)

	case srcCat == "images" && dstCat == "images":
		return imageLossReport(src, dst)

	case srcCat == "archives" && dstCat == "archives":
		return archiveLossReport(src, dst)

	case srcCat == "text" && dstCat == "text":
		return textLossReport(src, dst)

	case srcCat == "binary" && dstCat == "binary":
		// Encoding raw bytes as base64/base32/hex/quoted-printable, or
		// decoding back, is bit-for-bit reversible in every direction
		// this build implements.
		return ConvertLossReport{}
	}

	return ConvertLossReport{
		Lossy:   true,
		Reasons: []string{fmt.Sprintf("Converting %s to %s is not a same-category conversion this build understands losslessly; treat the result as best-effort.", src, dst)},
	}
}

func structuredLossReport(src, dst string) ConvertLossReport {
	var reasons []string
	lossy := false

	if src == "yaml" {
		lossy = true
		reasons = append(reasons, "YAML comments and anchors/aliases are not preserved by any target format.")
	}
	if src == "xml" {
		lossy = true
		reasons = append(reasons, "XML attributes, comments and mixed content are approximated as JSON-style objects/arrays; exact XML schema does not round-trip.")
	}
	if src == "csv" && dst != "csv" {
		lossy = true
		reasons = append(reasons, "CSV has no types: every value is a string, and every row must share the same shape.")
	}
	if dst == "csv" && src != "csv" {
		lossy = true
		reasons = append(reasons, "CSV target requires a flat array of objects (rows); nested values are encoded as JSON text in each cell, and the source must already be shaped that way or the job will fail rather than guess.")
	}
	if dst == "toml" && src != "toml" {
		reasons = append(reasons, "TOML requires a table at the document root; if the source's decoded root is not an object, it is nested under a synthetic \"data\" key.")
		lossy = true
	}
	if dst == "xml" && src != "xml" {
		reasons = append(reasons, "XML requires exactly one root element; if the source has no single natural root, it is wrapped under a synthetic <document> element.")
		lossy = true
	}
	if src == "json" && dst == "toml" {
		reasons = append(reasons, "JSON's null has no TOML equivalent and is dropped from the key that held it.")
		lossy = true
	}

	return ConvertLossReport{Lossy: lossy, Reasons: reasons}
}

func imageLossReport(src, dst string) ConvertLossReport {
	switch dst {
	case "jpeg":
		return ConvertLossReport{
			Lossy: true, Irreversible: true,
			Reasons: []string{"JPEG re-encode discards data permanently (lossy compression) and drops any alpha channel."},
		}
	case "gif":
		return ConvertLossReport{
			Lossy: true, Irreversible: true,
			Reasons: []string{"GIF encoding quantizes the image to a 256-color palette."},
		}
	case "bmp":
		return ConvertLossReport{
			Lossy:   true,
			Reasons: []string{"BMP does not preserve transparency or embedded color profile metadata."},
		}
	}
	if src == "jpeg" {
		return ConvertLossReport{
			Lossy:   true,
			Reasons: []string{"The source JPEG's compression artifacts are already permanent; re-encoding to a lossless target does not recover the original data."},
		}
	}
	return ConvertLossReport{}
}

func archiveLossReport(src, dst string) ConvertLossReport {
	if dst == "zip" && src != "zip" {
		return ConvertLossReport{
			Lossy:   true,
			Reasons: []string{"ZIP does not reliably preserve POSIX permissions, symlinks, or owner/group metadata carried by a tar-based source."},
		}
	}
	return ConvertLossReport{}
}

func textLossReport(src, dst string) ConvertLossReport {
	narrow := map[string]bool{"latin1": true, "windows1252": true}
	if narrow[dst] && !narrow[src] {
		return ConvertLossReport{
			Lossy:   true,
			Reasons: []string{fmt.Sprintf("%s only covers a narrow character set; any character outside it is replaced.", dst)},
		}
	}
	if narrow[src] && narrow[dst] && src != dst {
		return ConvertLossReport{
			Lossy:   true,
			Reasons: []string{"Latin-1 and Windows-1252 disagree on the 0x80-0x9F range; a handful of characters do not round-trip between them."},
		}
	}
	return ConvertLossReport{}
}

// ============================================================================
// Structured Data: json, yaml, toml, csv, xml, via a common `any` IR
// ============================================================================

// decodeStructured reads r as the named structured-data format and returns
// its generic decoded value (maps/slices/scalars), streaming from r rather
// than buffering the whole document as raw bytes first.
func decodeStructured(format string, r io.Reader) (any, error) {
	switch format {
	case "json":
		var v any
		dec := json.NewDecoder(r)
		dec.UseNumber()
		if err := dec.Decode(&v); err != nil {
			return nil, fmt.Errorf("invalid JSON: %w", err)
		}
		return v, nil
	case "yaml":
		var v any
		if err := yaml.NewDecoder(r).Decode(&v); err != nil {
			return nil, fmt.Errorf("invalid YAML: %w", err)
		}
		return v, nil
	case "toml":
		var v any
		if err := toml.NewDecoder(r).Decode(&v); err != nil {
			return nil, fmt.Errorf("invalid TOML: %w", err)
		}
		return v, nil
	case "csv":
		return decodeCSVToAny(r)
	case "xml":
		return decodeXMLToAny(r)
	default:
		return nil, fmt.Errorf("unsupported structured-data source format %q", format)
	}
}

// encodeStructured writes v to w as the named structured-data format.
func encodeStructured(format string, w io.Writer, v any) error {
	switch format {
	case "json":
		enc := json.NewEncoder(w)
		enc.SetIndent("", "  ")
		if err := enc.Encode(v); err != nil {
			return fmt.Errorf("encode JSON: %w", err)
		}
		return nil
	case "yaml":
		enc := yaml.NewEncoder(w)
		enc.SetIndent(2)
		if err := enc.Encode(v); err != nil {
			return fmt.Errorf("encode YAML: %w", err)
		}
		return enc.Close()
	case "toml":
		return encodeAnyToTOML(w, v)
	case "csv":
		return encodeAnyToCSV(w, v)
	case "xml":
		return encodeAnyToXML(w, v)
	default:
		return fmt.Errorf("unsupported structured-data target format %q", format)
	}
}

func encodeAnyToTOML(w io.Writer, v any) error {
	root, ok := v.(map[string]any)
	if !ok {
		root = map[string]any{"data": v}
	}
	root = jsonNumberDeep(root).(map[string]any)
	if err := toml.NewEncoder(w).Encode(root); err != nil {
		return fmt.Errorf("encode TOML: %w", err)
	}
	return nil
}

// jsonNumberDeep walks a decoded value replacing json.Number (produced by
// decodeStructured's UseNumber, so integers survive JSON round-trips
// without becoming float64) with an int64 or float64 as appropriate, since
// only json itself understands json.Number.
func jsonNumberDeep(v any) any {
	switch t := v.(type) {
	case json.Number:
		if i, err := t.Int64(); err == nil {
			return i
		}
		if f, err := t.Float64(); err == nil {
			return f
		}
		return t.String()
	case map[string]any:
		out := make(map[string]any, len(t))
		for k, val := range t {
			out[k] = jsonNumberDeep(val)
		}
		return out
	case []any:
		out := make([]any, len(t))
		for i, val := range t {
			out[i] = jsonNumberDeep(val)
		}
		return out
	default:
		return v
	}
}

// --- CSV <-> any -------------------------------------------------------

func decodeCSVToAny(r io.Reader) (any, error) {
	cr := csv.NewReader(r)
	cr.FieldsPerRecord = -1
	header, err := cr.Read()
	if err == io.EOF {
		return []any{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("invalid CSV header: %w", err)
	}

	rows := []any{}
	for {
		record, err := cr.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("invalid CSV row: %w", err)
		}
		row := make(map[string]any, len(header))
		for i, key := range header {
			if i < len(record) {
				row[key] = record[i]
			} else {
				row[key] = ""
			}
		}
		rows = append(rows, row)
	}
	return rows, nil
}

func encodeAnyToCSV(w io.Writer, v any) error {
	rows, ok := v.([]any)
	if !ok {
		// XML (and, less often, JSON/YAML/TOML) frequently root a row
		// list one level down, under a single wrapping key -- exactly
		// what decodeXMLToAny always produces (map[string]any{root:
		// value}). Unwrap that one common shape before giving up, so
		// XML -> CSV is not dead on arrival for the ordinary case of a
		// document whose only content is a list.
		if m, isMap := v.(map[string]any); isMap {
			rows, ok = unwrapSingleRowList(m)
		}
	}
	if !ok {
		return fmt.Errorf("CSV target requires an array of objects (rows); the source document's root is %s", describeShape(v))
	}

	var header []string
	seen := map[string]bool{}
	maps := make([]map[string]any, 0, len(rows))
	for i, item := range rows {
		row, ok := item.(map[string]any)
		if !ok {
			return fmt.Errorf("CSV target requires every array element to be an object; element %d is %s", i, describeShape(item))
		}
		maps = append(maps, row)
		for k := range row {
			if !seen[k] {
				seen[k] = true
				header = append(header, k)
			}
		}
	}
	sort.Strings(header)

	cw := csv.NewWriter(w)
	if err := cw.Write(header); err != nil {
		return fmt.Errorf("write CSV header: %w", err)
	}
	record := make([]string, len(header))
	for _, row := range maps {
		for i, key := range header {
			record[i] = csvCellString(row[key])
		}
		if err := cw.Write(record); err != nil {
			return fmt.Errorf("write CSV row: %w", err)
		}
	}
	cw.Flush()
	if err := cw.Error(); err != nil {
		return fmt.Errorf("flush CSV: %w", err)
	}
	return nil
}

func csvCellString(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return t
	case bool:
		return strconv.FormatBool(t)
	case json.Number:
		return t.String()
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	case int64:
		return strconv.FormatInt(t, 10)
	case int:
		return strconv.Itoa(t)
	case time.Time:
		return t.Format(time.RFC3339)
	default:
		// Covers TOML's LocalDate/LocalDateTime/LocalTime (all implement
		// fmt.Stringer with a sensible textual form) and anything else
		// that knows how to describe itself, before falling back to a
		// JSON encoding -- note that json.Marshal of a bare string
		// produces a QUOTED JSON string, which is deliberately never
		// reached for a plain string (handled above) but would otherwise
		// embed stray quote characters in a CSV cell or XML text node.
		if stringer, ok := t.(fmt.Stringer); ok {
			return stringer.String()
		}
		b, err := json.Marshal(t)
		if err != nil {
			return fmt.Sprintf("%v", t)
		}
		return string(b)
	}
}

// unwrapSingleRowList descends through a chain of single-key maps (the
// shape decodeXMLToAny always produces, and the shape a hand-written
// JSON/YAML/TOML document with one wrapping object key often has too)
// looking for the first []any it finds. It gives up -- returning ok=false
// -- the moment a map has more than one key, since at that point there is
// no longer a single unambiguous list to unwrap.
func unwrapSingleRowList(m map[string]any) ([]any, bool) {
	for len(m) == 1 {
		var inner any
		for _, v := range m {
			inner = v
		}
		switch t := inner.(type) {
		case []any:
			return t, true
		case map[string]any:
			m = t
			continue
		}
		break
	}
	return nil, false
}

func describeShape(v any) string {
	switch v.(type) {
	case map[string]any:
		return "an object"
	case []any:
		return "an array"
	case nil:
		return "null"
	case string:
		return "a string"
	case bool:
		return "a boolean"
	default:
		return "a number"
	}
}

// --- XML <-> any ---------------------------------------------------------
//
// encoding/xml has no built-in "decode into map[string]any" the way
// encoding/json does (XML has no canonical mapping to JSON-shaped data),
// so this is a small, deliberate convention: attributes become "@name"
// keys, text content alongside children or attributes becomes a "#text"
// key, a bare leaf element with no attributes/children becomes its own
// trimmed text, and repeated sibling elements collapse into a []any. It is
// always disclosed as lossy (see structuredLossReport) because comments,
// processing instructions, and exact attribute-vs-element intent are not
// preserved.

func decodeXMLToAny(r io.Reader) (any, error) {
	dec := xml.NewDecoder(r)
	for {
		tok, err := dec.Token()
		if err != nil {
			return nil, fmt.Errorf("invalid XML: %w", err)
		}
		if start, ok := tok.(xml.StartElement); ok {
			value, err := decodeXMLElement(dec, start)
			if err != nil {
				return nil, fmt.Errorf("invalid XML: %w", err)
			}
			return map[string]any{start.Name.Local: value}, nil
		}
	}
}

func decodeXMLElement(dec *xml.Decoder, start xml.StartElement) (any, error) {
	node := map[string]any{}
	for _, attr := range start.Attr {
		node["@"+attr.Name.Local] = attr.Value
	}

	var text strings.Builder
	for {
		tok, err := dec.Token()
		if err != nil {
			return nil, err
		}
		switch t := tok.(type) {
		case xml.StartElement:
			child, err := decodeXMLElement(dec, t)
			if err != nil {
				return nil, err
			}
			addXMLChild(node, t.Name.Local, child)
		case xml.CharData:
			text.Write(t)
		case xml.EndElement:
			trimmed := strings.TrimSpace(text.String())
			if len(node) == 0 {
				return trimmed, nil
			}
			if trimmed != "" {
				node["#text"] = trimmed
			}
			return node, nil
		}
	}
}

func addXMLChild(node map[string]any, name string, value any) {
	existing, ok := node[name]
	if !ok {
		node[name] = value
		return
	}
	if list, ok := existing.([]any); ok {
		node[name] = append(list, value)
		return
	}
	node[name] = []any{existing, value}
}

func encodeAnyToXML(w io.Writer, v any) error {
	bw := bufio.NewWriter(w)
	if _, err := bw.WriteString(xml.Header); err != nil {
		return err
	}

	name, root := "document", v
	// If the source already has our own decodeXMLToAny shape -- a single
	// top-level key whose value is an object -- reuse that key as the
	// root element name instead of wrapping it a second time.
	if m, ok := v.(map[string]any); ok && len(m) == 1 {
		for k, val := range m {
			name, root = k, val
		}
	}
	if err := writeXMLElement(bw, name, root, 0); err != nil {
		return fmt.Errorf("encode XML: %w", err)
	}
	if err := bw.WriteByte('\n'); err != nil {
		return err
	}
	return bw.Flush()
}

func writeXMLElement(w *bufio.Writer, name string, v any, depth int) error {
	indent := strings.Repeat("  ", depth)
	name = xmlSafeName(name)

	m, isMap := v.(map[string]any)
	if !isMap {
		fmt.Fprintf(w, "%s<%s>", indent, name)
		if err := xml.EscapeText(w, []byte(scalarToText(v))); err != nil {
			return err
		}
		fmt.Fprintf(w, "</%s>\n", name)
		return nil
	}

	var attrKeys, childKeys []string
	for k := range m {
		if strings.HasPrefix(k, "@") {
			attrKeys = append(attrKeys, k)
		} else if k != "#text" {
			childKeys = append(childKeys, k)
		}
	}
	sort.Strings(attrKeys)
	sort.Strings(childKeys)

	fmt.Fprintf(w, "%s<%s", indent, name)
	for _, k := range attrKeys {
		fmt.Fprintf(w, ` %s="`, xmlSafeName(strings.TrimPrefix(k, "@")))
		if err := xml.EscapeText(w, []byte(scalarToText(m[k]))); err != nil {
			return err
		}
		w.WriteString(`"`)
	}

	text, hasText := m["#text"]
	if len(childKeys) == 0 && !hasText {
		w.WriteString("/>\n")
		return nil
	}
	w.WriteString(">")
	if hasText && len(childKeys) == 0 {
		if err := xml.EscapeText(w, []byte(scalarToText(text))); err != nil {
			return err
		}
		fmt.Fprintf(w, "</%s>\n", name)
		return nil
	}
	w.WriteString("\n")
	if hasText {
		fmt.Fprintf(w, "%s  ", indent)
		if err := xml.EscapeText(w, []byte(scalarToText(text))); err != nil {
			return err
		}
		w.WriteString("\n")
	}
	for _, k := range childKeys {
		switch val := m[k].(type) {
		case []any:
			for _, item := range val {
				if err := writeXMLElement(w, k, item, depth+1); err != nil {
					return err
				}
			}
		default:
			if err := writeXMLElement(w, k, val, depth+1); err != nil {
				return err
			}
		}
	}
	fmt.Fprintf(w, "%s</%s>\n", indent, name)
	return nil
}

// xmlSafeName makes a JSON/YAML/TOML/CSV key usable as an XML element or
// attribute name (must start with a letter or underscore and contain no
// whitespace); anything else falls back to a synthetic "field" name so
// encoding never fails outright on an odd key.
func xmlSafeName(name string) string {
	if name == "" {
		return "field"
	}
	var b strings.Builder
	for i, r := range name {
		valid := r == '_' || (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (i > 0 && r >= '0' && r <= '9') || r == '-' || (i > 0 && r == '.')
		if valid {
			b.WriteRune(r)
		} else {
			b.WriteRune('_')
		}
	}
	out := b.String()
	if out == "" {
		return "field"
	}
	return out
}

func scalarToText(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return t
	case bool:
		return strconv.FormatBool(t)
	case json.Number:
		return t.String()
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	case int64:
		return strconv.FormatInt(t, 10)
	case int:
		return strconv.Itoa(t)
	case time.Time:
		return t.Format(time.RFC3339)
	default:
		// Covers TOML's LocalDate/LocalDateTime/LocalTime (all implement
		// fmt.Stringer with a sensible textual form) and anything else
		// that knows how to describe itself, before falling back to a
		// JSON encoding -- note that json.Marshal of a bare string
		// produces a QUOTED JSON string, which is deliberately never
		// reached for a plain string (handled above) but would otherwise
		// embed stray quote characters in a CSV cell or XML text node.
		if stringer, ok := t.(fmt.Stringer); ok {
			return stringer.String()
		}
		b, err := json.Marshal(t)
		if err != nil {
			return fmt.Sprintf("%v", t)
		}
		return string(b)
	}
}

// ============================================================================
// Code/Text: encoding and line-ending conversion via x/text
// ============================================================================

// textEncoding returns the x/text encoding.Encoding for a Code/Text format
// ID. "utf8" and "utf8-crlf" differ only in line-ending policy, applied
// separately below, so both map to the identity UTF-8 encoding here.
func textEncoding(id string) (encoding.Encoding, error) {
	switch id {
	case "utf8", "utf8-crlf":
		return encoding.Nop, nil
	case "utf16le":
		return unicode.UTF16(unicode.LittleEndian, unicode.IgnoreBOM), nil
	case "utf16be":
		return unicode.UTF16(unicode.BigEndian, unicode.IgnoreBOM), nil
	case "latin1":
		return charmap.ISO8859_1, nil
	case "windows1252":
		return charmap.Windows1252, nil
	default:
		return nil, fmt.Errorf("unsupported Code/Text format %q", id)
	}
}

// convertText streams src (in the source encoding) to dst (in the target
// encoding), normalizing all line endings to LF internally and then, only
// for the "utf8-crlf" target, writing CRLF. Unsupported characters in a
// narrower target charset are replaced rather than aborting the job --
// exactly what lossReportFor's textLossReport discloses up front.
func convertText(srcID, dstID string, src io.Reader, dst io.Writer) error {
	srcEnc, err := textEncoding(srcID)
	if err != nil {
		return err
	}
	dstEnc, err := textEncoding(dstID)
	if err != nil {
		return err
	}

	decoded := transform.NewReader(bufio.NewReader(src), srcEnc.NewDecoder())
	normalized := &crlfNormalizingReader{r: bufio.NewReader(decoded)}

	var body io.Reader = normalized
	if dstID == "utf8-crlf" {
		body = &lfToCRLFReader{r: normalized}
	}

	encoder := encoding.ReplaceUnsupported(dstEnc.NewEncoder())
	encoded := transform.NewWriter(dst, encoder)
	if _, err := io.Copy(encoded, body); err != nil {
		return fmt.Errorf("convert text: %w", err)
	}
	return encoded.Close()
}

// crlfNormalizingReader rewrites CRLF and lone CR to LF as it streams, one
// small buffered lookahead at a time, so mixed line endings in the source
// never leak into the canonical internal form.
type crlfNormalizingReader struct {
	r *bufio.Reader
}

func (n *crlfNormalizingReader) Read(p []byte) (int, error) {
	i := 0
	for i < len(p) {
		b, err := n.r.ReadByte()
		if err != nil {
			if i > 0 {
				return i, nil
			}
			return 0, err
		}
		if b == '\r' {
			next, peekErr := n.r.Peek(1)
			if peekErr == nil && len(next) == 1 && next[0] == '\n' {
				n.r.ReadByte() // consume the \n that follows
			}
			p[i] = '\n'
			i++
			continue
		}
		p[i] = b
		i++
	}
	return i, nil
}

// lfToCRLFReader expands every LF in an already-normalized stream to CRLF.
type lfToCRLFReader struct {
	r         io.Reader
	pendingLF bool
}

func (e *lfToCRLFReader) Read(p []byte) (int, error) {
	if len(p) == 0 {
		return 0, nil
	}
	if e.pendingLF {
		p[0] = '\n'
		e.pendingLF = false
		return 1, nil
	}
	buf := make([]byte, 1)
	i := 0
	for i < len(p) {
		n, err := e.r.Read(buf)
		if n == 0 {
			if err != nil {
				if i > 0 {
					return i, nil
				}
				return 0, err
			}
			continue
		}
		if buf[0] == '\n' {
			if i+1 < len(p) {
				p[i] = '\r'
				p[i+1] = '\n'
				i += 2
			} else {
				p[i] = '\r'
				i++
				e.pendingLF = true
			}
		} else {
			p[i] = buf[0]
			i++
		}
	}
	return i, nil
}

// ============================================================================
// Binary Encodings: base64, base32, hex, quoted-printable, raw bytes
// ============================================================================

// convertBinary streams src through decode(srcID) then encode(dstID),
// treating "raw" as the identity (already-decoded) form. Every direction
// this build supports round-trips bit-for-bit.
func convertBinary(srcID, dstID string, src io.Reader, dst io.Writer) error {
	decoded, err := binaryDecodeReader(srcID, src)
	if err != nil {
		return err
	}
	return binaryEncodeStream(dstID, dst, decoded)
}

func binaryDecodeReader(id string, r io.Reader) (io.Reader, error) {
	switch id {
	case "raw":
		return r, nil
	case "base64":
		return base64.NewDecoder(base64.StdEncoding, textTrimmingReader{r}), nil
	case "base32":
		return base32.NewDecoder(base32.StdEncoding, textTrimmingReader{r}), nil
	case "hex":
		return hex.NewDecoder(textTrimmingReader{r}), nil
	case "quoted-printable":
		return quotedprintable.NewReader(r), nil
	default:
		return nil, fmt.Errorf("unsupported Binary Encodings source format %q", id)
	}
}

func binaryEncodeStream(id string, w io.Writer, r io.Reader) error {
	switch id {
	case "raw":
		_, err := io.Copy(w, r)
		return err
	case "base64":
		enc := base64.NewEncoder(base64.StdEncoding, w)
		if _, err := io.Copy(enc, r); err != nil {
			return err
		}
		return enc.Close()
	case "base32":
		enc := base32.NewEncoder(base32.StdEncoding, w)
		if _, err := io.Copy(enc, r); err != nil {
			return err
		}
		return enc.Close()
	case "hex":
		enc := hex.NewEncoder(w)
		_, err := io.Copy(enc, r)
		return err
	case "quoted-printable":
		enc := quotedprintable.NewWriter(w)
		if _, err := io.Copy(enc, r); err != nil {
			return err
		}
		return enc.Close()
	default:
		return fmt.Errorf("unsupported Binary Encodings target format %q", id)
	}
}

// textTrimmingReader strips ASCII whitespace from a base64/base32/hex
// source stream as it is read, since a text-encoded file picked up from
// disk very often carries trailing newlines that would otherwise trip the
// strict stdlib decoders.
type textTrimmingReader struct{ r io.Reader }

func (t textTrimmingReader) Read(p []byte) (int, error) {
	buf := make([]byte, len(p))
	n, err := t.r.Read(buf)
	out := 0
	for i := 0; i < n; i++ {
		b := buf[i]
		if b == ' ' || b == '\n' || b == '\r' || b == '\t' {
			continue
		}
		p[out] = b
		out++
	}
	if out == 0 && err == nil && n > 0 {
		// Every byte in this chunk was whitespace; ask for more rather
		// than returning a spurious zero-length, nil-error read.
		return t.Read(p)
	}
	return out, err
}

// ============================================================================
// Images: png, jpeg, gif, bmp, tiff decode+encode; webp decode only
// ============================================================================

// convertMaxMegapixels bounds the one documented in-memory exception in
// this whole pipeline: decoding an image necessarily holds one full frame
// in memory (image.Image), so this caps that frame's pixel count rather
// than pretending image conversion is constant-memory.
const convertMaxMegapixels = 200_000_000 // 200 MP

func convertImage(srcID, dstID string, src io.Reader, dst io.Writer) error {
	img, err := decodeImage(srcID, src)
	if err != nil {
		return err
	}
	bounds := img.Bounds()
	pixels := int64(bounds.Dx()) * int64(bounds.Dy())
	if pixels > convertMaxMegapixels {
		return fmt.Errorf("image is %d megapixels, over this build's %d megapixel decode limit", pixels/1_000_000, convertMaxMegapixels/1_000_000)
	}
	return encodeImage(dstID, dst, img)
}

func decodeImage(id string, r io.Reader) (image.Image, error) {
	switch id {
	case "png":
		return png.Decode(r)
	case "jpeg":
		return jpeg.Decode(r)
	case "gif":
		return gif.Decode(r)
	case "bmp":
		return bmp.Decode(r)
	case "tiff":
		return tiff.Decode(r)
	case "webp":
		return webp.Decode(r)
	default:
		return nil, fmt.Errorf("unsupported Images source format %q", id)
	}
}

func encodeImage(id string, w io.Writer, img image.Image) error {
	switch id {
	case "png":
		return png.Encode(w, img)
	case "jpeg":
		return jpeg.Encode(w, img, &jpeg.Options{Quality: 92})
	case "gif":
		return gif.Encode(w, img, nil)
	case "bmp":
		return bmp.Encode(w, img)
	case "tiff":
		return tiff.Encode(w, img, nil)
	case "webp":
		return errors.New("this build cannot encode WebP; only WebP decoding (import) is available offline")
	default:
		return fmt.Errorf("unsupported Images target format %q", id)
	}
}

// ============================================================================
// PDF: text extraction only (pdf -> txt)
// ============================================================================

// convertPDFToText streams pages of a PDF via ledongthuc/pdf, using the
// input *os.File directly as an io.ReaderAt (the format the PDF library
// itself requires, since the cross-reference table sits at the end of the
// file) rather than reading the whole file into a byte slice first.
func convertPDFToText(input *os.File, size int64, dst io.Writer) error {
	reader, err := pdf.NewReader(input, size)
	if err != nil {
		return fmt.Errorf("open PDF: %w", err)
	}

	w := bufio.NewWriter(dst)
	numPages := reader.NumPage()
	wrote := false
	for i := 1; i <= numPages; i++ {
		page := reader.Page(i)
		if page.V.IsNull() {
			continue
		}
		text, err := page.GetPlainText(nil)
		if err != nil {
			continue // a single unreadable page does not fail the whole document
		}
		if strings.TrimSpace(text) == "" {
			continue
		}
		if wrote {
			fmt.Fprintf(w, "\n\n--- Page %d ---\n", i)
		}
		w.WriteString(text)
		wrote = true
	}
	return w.Flush()
}

// ============================================================================
// Archives: zip, tar, tar.gz, tar.zst -- entry-by-entry streaming
// ============================================================================
//
// Conversion never buffers a whole archive or a whole entry in memory: for
// each entry, an io.Copy streams its content straight from the source
// container's entry reader into the destination container's entry writer.

// archiveEntry is one file (or directory) inside an archive, abstracted
// away from which container format it came from.
type archiveEntry struct {
	Name    string
	IsDir   bool
	Mode    fs.FileMode
	ModTime time.Time
	Size    int64
}

// archiveReader iterates entries of one open archive. Next returns
// ok=false, err=nil once every entry has been visited.
type archiveReader interface {
	Next() (entry archiveEntry, content io.Reader, ok bool, err error)
	Close() error
}

// archiveWriter appends one entry (with its content, nil for a directory)
// to a destination archive.
type archiveWriter interface {
	WriteEntry(entry archiveEntry, content io.Reader) error
	Close() error
}

func convertArchive(ctx context.Context, srcID string, input *os.File, size int64, dstID string, dst io.Writer) error {
	reader, err := openArchiveReader(srcID, input, size)
	if err != nil {
		return err
	}
	defer reader.Close()

	writer, err := newArchiveWriter(dstID, dst)
	if err != nil {
		return err
	}

	for {
		if err := ctx.Err(); err != nil {
			writer.Close()
			return err
		}
		entry, content, ok, err := reader.Next()
		if err != nil {
			writer.Close()
			return fmt.Errorf("read %s entry: %w", srcID, err)
		}
		if !ok {
			break
		}
		if err := writer.WriteEntry(entry, content); err != nil {
			writer.Close()
			return fmt.Errorf("write %s entry %q: %w", dstID, entry.Name, err)
		}
	}
	return writer.Close()
}

// --- zip reader/writer -----------------------------------------------------

type zipArchiveReader struct {
	rc      *zip.ReadCloser
	i       int
	current io.ReadCloser
}

func openZipArchiveReader(path string) (*zipArchiveReader, error) {
	rc, err := zip.OpenReader(path)
	if err != nil {
		return nil, fmt.Errorf("open zip: %w", err)
	}
	return &zipArchiveReader{rc: rc}, nil
}

func (z *zipArchiveReader) Next() (archiveEntry, io.Reader, bool, error) {
	if z.current != nil {
		z.current.Close()
		z.current = nil
	}
	if z.i >= len(z.rc.File) {
		return archiveEntry{}, nil, false, nil
	}
	f := z.rc.File[z.i]
	z.i++
	entry := archiveEntry{Name: f.Name, IsDir: f.FileInfo().IsDir(), Mode: f.Mode(), ModTime: f.Modified, Size: int64(f.UncompressedSize64)}
	if entry.IsDir {
		return entry, nil, true, nil
	}
	rc, err := f.Open()
	if err != nil {
		return archiveEntry{}, nil, false, err
	}
	z.current = rc
	return entry, rc, true, nil
}

func (z *zipArchiveReader) Close() error {
	if z.current != nil {
		z.current.Close()
	}
	return z.rc.Close()
}

type zipArchiveWriter struct{ zw *zip.Writer }

func newZipArchiveWriter(w io.Writer) *zipArchiveWriter {
	return &zipArchiveWriter{zw: zip.NewWriter(w)}
}

func (z *zipArchiveWriter) WriteEntry(entry archiveEntry, content io.Reader) error {
	name := entry.Name
	if entry.IsDir && !strings.HasSuffix(name, "/") {
		name += "/"
	}
	fh := &zip.FileHeader{Name: name, Modified: entry.ModTime}
	fh.SetMode(entry.Mode)
	if entry.IsDir {
		fh.Method = zip.Store
		_, err := z.zw.CreateHeader(fh)
		return err
	}
	fh.Method = zip.Deflate
	w, err := z.zw.CreateHeader(fh)
	if err != nil {
		return err
	}
	_, err = io.Copy(w, content)
	return err
}

func (z *zipArchiveWriter) Close() error { return z.zw.Close() }

// --- tar (+gz / +zstd) reader/writer -----------------------------------

type tarArchiveReader struct {
	tr     *tar.Reader
	closer io.Closer // the underlying decompressor, if any
	file   *os.File
}

func openTarArchiveReader(id string, f *os.File) (*tarArchiveReader, error) {
	switch id {
	case "tar":
		return &tarArchiveReader{tr: tar.NewReader(f), file: f}, nil
	case "tar.gz":
		gz, err := gzip.NewReader(f)
		if err != nil {
			return nil, fmt.Errorf("open gzip stream: %w", err)
		}
		return &tarArchiveReader{tr: tar.NewReader(gz), closer: gz, file: f}, nil
	case "tar.zst":
		zr, err := zstd.NewReader(f)
		if err != nil {
			return nil, fmt.Errorf("open zstd stream: %w", err)
		}
		return &tarArchiveReader{tr: tar.NewReader(zr), closer: zstdCloser{zr}, file: f}, nil
	default:
		return nil, fmt.Errorf("unsupported archive source format %q", id)
	}
}

// zstdCloser adapts zstd.Decoder's Close() (which returns no error) to
// io.Closer.
type zstdCloser struct{ d *zstd.Decoder }

func (z zstdCloser) Close() error { z.d.Close(); return nil }

func (t *tarArchiveReader) Next() (archiveEntry, io.Reader, bool, error) {
	hdr, err := t.tr.Next()
	if err == io.EOF {
		return archiveEntry{}, nil, false, nil
	}
	if err != nil {
		return archiveEntry{}, nil, false, err
	}
	entry := archiveEntry{
		Name:    hdr.Name,
		IsDir:   hdr.Typeflag == tar.TypeDir,
		Mode:    fs.FileMode(hdr.Mode),
		ModTime: hdr.ModTime,
		Size:    hdr.Size,
	}
	if entry.IsDir || hdr.Typeflag != tar.TypeReg {
		return entry, nil, true, nil
	}
	return entry, t.tr, true, nil
}

func (t *tarArchiveReader) Close() error {
	if t.closer != nil {
		return t.closer.Close()
	}
	return nil
}

type tarArchiveWriter struct {
	tw     *tar.Writer
	closer io.Closer // the underlying compressor, if any
}

func newTarArchiveWriter(id string, w io.Writer) (*tarArchiveWriter, error) {
	switch id {
	case "tar":
		return &tarArchiveWriter{tw: tar.NewWriter(w)}, nil
	case "tar.gz":
		gz := gzip.NewWriter(w)
		return &tarArchiveWriter{tw: tar.NewWriter(gz), closer: gz}, nil
	case "tar.zst":
		zw, err := zstd.NewWriter(w)
		if err != nil {
			return nil, fmt.Errorf("open zstd writer: %w", err)
		}
		return &tarArchiveWriter{tw: tar.NewWriter(zw), closer: zw}, nil
	default:
		return nil, fmt.Errorf("unsupported archive target format %q", id)
	}
}

func (t *tarArchiveWriter) WriteEntry(entry archiveEntry, content io.Reader) error {
	hdr := &tar.Header{
		Name:    entry.Name,
		Mode:    int64(entry.Mode.Perm()),
		ModTime: entry.ModTime,
	}
	if entry.IsDir {
		hdr.Typeflag = tar.TypeDir
		if !strings.HasSuffix(hdr.Name, "/") {
			hdr.Name += "/"
		}
	} else {
		hdr.Typeflag = tar.TypeReg
		hdr.Size = entry.Size
	}
	if err := t.tw.WriteHeader(hdr); err != nil {
		return err
	}
	if entry.IsDir || content == nil {
		return nil
	}
	_, err := io.Copy(t.tw, content)
	return err
}

func (t *tarArchiveWriter) Close() error {
	if err := t.tw.Close(); err != nil {
		return err
	}
	if t.closer != nil {
		return t.closer.Close()
	}
	return nil
}

func openArchiveReader(id string, f *os.File, size int64) (archiveReader, error) {
	switch id {
	case "zip":
		return openZipArchiveReader(f.Name())
	case "tar", "tar.gz", "tar.zst":
		return openTarArchiveReader(id, f)
	default:
		return nil, fmt.Errorf("unsupported archive source format %q", id)
	}
}

func newArchiveWriter(id string, w io.Writer) (archiveWriter, error) {
	switch id {
	case "zip":
		return newZipArchiveWriter(w), nil
	case "tar", "tar.gz", "tar.zst":
		return newTarArchiveWriter(id, w)
	default:
		return nil, fmt.Errorf("unsupported archive target format %q", id)
	}
}

// ============================================================================
// Dispatch: run one conversion, then validate its output
// ============================================================================

// runConversion performs one src -> dst conversion from inputPath into
// output, dispatching to the category-appropriate adapter. output is
// already the job's temp file, opened by the caller; runConversion never
// renames or deletes it -- that is the job runner's job, after validation.
// It is a concrete *os.File, not just an io.Writer, because the external-
// adapter path needs a real path to hand a bounded child process.
func runConversion(ctx context.Context, srcID, dstID string, inputPath string, output *os.File) error {
	srcCat, dstCat := categoryOf(srcID), categoryOf(dstID)

	switch {
	case srcID == "pdf" && dstID == "txt":
		f, err := os.Open(inputPath)
		if err != nil {
			return err
		}
		defer f.Close()
		info, err := f.Stat()
		if err != nil {
			return err
		}
		return convertPDFToText(f, info.Size(), output)

	case srcCat == "structured" && dstCat == "structured":
		f, err := os.Open(inputPath)
		if err != nil {
			return err
		}
		defer f.Close()
		value, err := decodeStructured(srcID, bufio.NewReader(f))
		if err != nil {
			return err
		}
		return encodeStructured(dstID, output, value)

	case srcCat == "text" && dstCat == "text":
		f, err := os.Open(inputPath)
		if err != nil {
			return err
		}
		defer f.Close()
		return convertText(srcID, dstID, f, output)

	case srcCat == "binary" && dstCat == "binary":
		f, err := os.Open(inputPath)
		if err != nil {
			return err
		}
		defer f.Close()
		return convertBinary(srcID, dstID, f, output)

	case srcCat == "images" && dstCat == "images":
		f, err := os.Open(inputPath)
		if err != nil {
			return err
		}
		defer f.Close()
		return convertImage(srcID, dstID, f, output)

	case srcCat == "archives" && dstCat == "archives":
		f, err := os.Open(inputPath)
		if err != nil {
			return err
		}
		defer f.Close()
		info, err := f.Stat()
		if err != nil {
			return err
		}
		return convertArchive(ctx, srcID, f, info.Size(), dstID, output)

	default:
		return externalAdapterConvert(ctx, srcID, dstID, inputPath, output)
	}
}

// convertMaxOutputBytes caps how much an external converter's child
// process may write, enforced by wrapping its output file descriptor.
const convertMaxOutputBytes = 8 << 30 // 8 GiB

// validateOutput re-reads the just-written temp file with the same rules a
// real consumer would apply, so a job that produced something broken is
// reported as failed rather than handed to the user. Every branch here
// re-opens the file fresh -- it deliberately does not trust any in-memory
// state left over from the conversion step.
func validateOutput(dstID, path string) error {
	dstCat := categoryOf(dstID)

	switch {
	case dstID == "txt":
		return validateUTF8File(path)

	case dstCat == "structured":
		f, err := os.Open(path)
		if err != nil {
			return err
		}
		defer f.Close()
		_, err = decodeStructured(dstID, bufio.NewReader(f))
		if err != nil {
			return fmt.Errorf("output failed to re-decode as %s: %w", dstID, err)
		}
		return nil

	case dstCat == "text":
		return validateTextFile(dstID, path)

	case dstCat == "binary":
		return validateBinaryFile(dstID, path)

	case dstCat == "images":
		f, err := os.Open(path)
		if err != nil {
			return err
		}
		defer f.Close()
		img, err := decodeImage(dstID, f)
		if err != nil {
			return fmt.Errorf("output failed to re-decode as %s: %w", dstID, err)
		}
		bounds := img.Bounds()
		if bounds.Dx() <= 0 || bounds.Dy() <= 0 {
			return fmt.Errorf("output %s decoded to an empty image", dstID)
		}
		return nil

	case dstCat == "archives":
		return validateArchiveFile(dstID, path)

	default:
		// External-adapter targets are validated by externalAdapterConvert
		// itself (it re-probes the produced file), so there is nothing
		// further to check here.
		return nil
	}
}

// validateUTF8File streams a file in chunks and confirms it is valid UTF-8
// throughout, without ever holding the whole file in memory. A multi-byte
// rune split across a chunk boundary is handled by carrying the trailing
// incomplete bytes (at most utf8.UTFMax-1 of them) into the next chunk
// before validating, rather than accepting or rejecting a boundary split
// out of context.
func validateUTF8File(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()

	r := bufio.NewReader(f)
	const chunkSize = 64 * 1024
	buf := make([]byte, chunkSize+utf8.UTFMax)
	carry := 0
	for {
		n, readErr := r.Read(buf[carry : carry+chunkSize])
		chunk := buf[:carry+n]

		valid := chunk
		nextCarry := 0
		if readErr != io.EOF && n > 0 {
			// Hold back a possibly-incomplete trailing rune until more
			// bytes arrive, rather than judging it prematurely.
			for back := 1; back <= utf8.UTFMax-1 && back <= len(chunk); back++ {
				if utf8.RuneStart(chunk[len(chunk)-back]) {
					if !utf8.FullRune(chunk[len(chunk)-back:]) {
						nextCarry = back
					}
					break
				}
			}
			valid = chunk[:len(chunk)-nextCarry]
		}

		if !utf8.Valid(valid) {
			return errors.New("output is not valid UTF-8 text")
		}
		if nextCarry > 0 {
			copy(buf[0:nextCarry], chunk[len(chunk)-nextCarry:])
		}
		carry = nextCarry

		if readErr == io.EOF {
			if carry > 0 {
				return errors.New("output is not valid UTF-8 text")
			}
			return nil
		}
		if readErr != nil {
			return readErr
		}
	}
}

func validateTextFile(dstID, path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	dstEnc, err := textEncoding(dstID)
	if err != nil {
		return err
	}
	decoded := transform.NewReader(f, dstEnc.NewDecoder())
	if _, err := io.Copy(io.Discard, decoded); err != nil {
		return fmt.Errorf("output failed to re-decode as %s: %w", dstID, err)
	}
	return nil
}

func validateBinaryFile(dstID, path string) error {
	if dstID == "raw" {
		info, err := os.Stat(path)
		if err != nil {
			return err
		}
		if info.Size() == 0 {
			return errors.New("output is empty")
		}
		return nil
	}
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	decoded, err := binaryDecodeReader(dstID, f)
	if err != nil {
		return err
	}
	if _, err := io.Copy(io.Discard, decoded); err != nil {
		return fmt.Errorf("output failed to re-decode as %s: %w", dstID, err)
	}
	return nil
}

func validateArchiveFile(dstID, path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return err
	}
	reader, err := openArchiveReader(dstID, f, info.Size())
	if err != nil {
		return fmt.Errorf("output failed to re-open as %s: %w", dstID, err)
	}
	defer reader.Close()
	for {
		_, content, ok, err := reader.Next()
		if err != nil {
			return fmt.Errorf("output failed to re-read as %s: %w", dstID, err)
		}
		if !ok {
			return nil
		}
		if content != nil {
			if _, err := io.Copy(io.Discard, content); err != nil {
				return fmt.Errorf("output entry unreadable in %s: %w", dstID, err)
			}
		}
	}
}

// ============================================================================
// External adapters (bounded child process)
// ============================================================================
//
// Nothing in this build's catalog is actually available through this path
// today -- audio, video, Documents, and modern-image encode all ship
// disabled (see convertCatalog/externalTool) because lib/converters is
// empty in this build. This function exists so that the moment a real
// tool is dropped into lib/converters next to the executable, its formats
// both light up as available in the catalog AND are genuinely runnable
// here, isolated the same way as everything else: a bounded context, a
// hard cap on output bytes, and on Windows a Job Object (see
// convert_windows.go) that guarantees the whole process tree dies the
// moment its handle closes. This is a bounded child process, not a
// sandbox -- it does not restrict filesystem or network access, only
// lifetime and memory.

// boundedProcessLimiter is overridden on Windows (see convert_windows.go's
// init) to place a freshly-started *exec.Cmd's process into a Job Object.
// It is called after cmd.Start() (so cmd.Process is populated) and before
// cmd.Wait(), and returns a release func to call once the process has
// exited -- closing the Job Object handle, which per
// JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE kills anything still running in it.
// On other platforms it is a deliberate no-op: the child still gets a
// bounded context and an output byte cap from runExternalTool, just not
// OS-level memory/process-tree containment.
var boundedProcessLimiter = func(cmd *exec.Cmd) (release func(), err error) {
	return func() {}, nil
}

// externalAdapterConvert looks up the external tool this src/dst pair
// would need. In this build lib/converters is always empty, so every
// path below reaches one of the two "not available offline" returns --
// the same exact explanation the catalog already gives, never a fake
// success. The bounded-child-process invocation is nonetheless real,
// working code: the moment a compatible binary is dropped into
// lib/converters, the matching formats light up as available in the
// catalog (see externalTool) and this function actually runs them.
func externalAdapterConvert(ctx context.Context, srcID, dstID string, inputPath string, output *os.File) error {
	srcFormat, srcOK := findFormat(srcID)
	dstFormat, dstOK := findFormat(dstID)
	if !srcOK || !dstOK {
		return fmt.Errorf("unknown format pair %q -> %q", srcID, dstID)
	}
	if !srcFormat.Available {
		return fmt.Errorf("%s is not available offline: missing %s (expected at %s)", srcFormat.Label, srcFormat.MissingDependency, srcFormat.ExpectedPath)
	}
	if !dstFormat.Available {
		return fmt.Errorf("%s is not available offline: missing %s (expected at %s)", dstFormat.Label, dstFormat.MissingDependency, dstFormat.ExpectedPath)
	}
	// Both formats are available, meaning each resolved to a real binary
	// under lib/converters (externalTool re-verifies rather than trusting
	// the catalog snapshot, in case the file vanished between catalog
	// build and now). srcFormat.tool and dstFormat.tool may legitimately
	// differ (e.g. a Documents tool importing into a shape a different
	// tool exports); this build has no case where that happens, but the
	// convention below -- resolve the source tool, ask it to produce the
	// target format directly -- covers the common case of one converter
	// handling both ends of a family (ffmpeg for audio/video, pandoc for
	// Documents).
	tool := srcFormat.tool
	if tool == "" {
		tool = dstFormat.tool
	}
	toolPath, available := externalTool(tool)
	if !available {
		return fmt.Errorf("%s is not available offline: missing %s (expected at %s)", srcFormat.Label, tool, toolPath)
	}
	return runExternalTool(ctx, toolPath, srcID, dstID, inputPath, output)
}

// runExternalTool invokes toolPath as a bounded child process:
// --from/--to/--input/--output is this build's own minimal convention for
// an external converter binary dropped into lib/converters (documented in
// this project's converter feature docs). The child's stdout/stdin are
// not connected; it is expected to write its result to the --output path
// itself and report failure via a non-zero exit code plus stderr.
func runExternalTool(ctx context.Context, toolPath, srcID, dstID, inputPath string, output *os.File) error {
	// The child gets its own sibling temp path to write to, never the
	// exact path of our already-open `output` handle: on Windows a
	// second process cannot open a file for writing while this process
	// still holds it open, which would deadlock every external
	// conversion. Its content is streamed into `output` afterward, and
	// the sibling is always removed -- `output` itself stays open the
	// whole time, so the job runner's single Close()-after-runConversion
	// contract holds for this branch exactly as it does for every other.
	childOutput, err := os.CreateTemp(filepath.Dir(output.Name()), ".external-convert-*.tmp")
	if err != nil {
		return fmt.Errorf("stage external converter output: %w", err)
	}
	childPath := childOutput.Name()
	childOutput.Close()
	defer os.Remove(childPath)

	cmd := exec.CommandContext(ctx, toolPath,
		"--from", srcID,
		"--to", dstID,
		"--input", inputPath,
		"--output", childPath,
	)
	cmd.Dir = externalConverterDir()

	var stderr strings.Builder
	cmd.Stderr = &stderr

	// Start (not Run) deliberately: boundedProcessLimiter must run after
	// the process exists (cmd.Process is non-nil) so it has a PID to
	// place in a Job Object, and before Wait() so the whole run stays
	// bounded from as close to process creation as os/exec allows.
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start %s: %w", filepath.Base(toolPath), err)
	}
	release, err := boundedProcessLimiter(cmd)
	if err != nil {
		cmd.Process.Kill()
		cmd.Wait()
		return fmt.Errorf("bound external converter process: %w", err)
	}
	defer release()

	if err := cmd.Wait(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg != "" {
			return fmt.Errorf("%s: %w: %s", filepath.Base(toolPath), err, msg)
		}
		return fmt.Errorf("%s: %w", filepath.Base(toolPath), err)
	}

	produced, err := os.Open(childPath)
	if err != nil {
		return fmt.Errorf("external converter produced no readable output: %w", err)
	}
	defer produced.Close()
	info, err := produced.Stat()
	if err != nil {
		return err
	}
	if info.Size() > convertMaxOutputBytes {
		return fmt.Errorf("external converter output exceeded the %d byte cap for this job", convertMaxOutputBytes)
	}
	if _, err := io.Copy(output, produced); err != nil {
		return fmt.Errorf("stream external converter output: %w", err)
	}
	return nil
}

// ============================================================================
// Path safety: picker-issued paths only
// ============================================================================
//
// File selection comes through the existing webview `selectFiles` binding
// (app/cmd/app/webview.go), which reads a native OS file picker and hands
// each selected path (plus its bytes, as a data URL) directly to the
// renderer. That binding takes no arguments from JS -- it is Go code
// invoking a native dialog, not a renderer-controlled call -- which is
// exactly what makes a path it reports trustworthy: nothing the renderer
// can execute chooses what that dialog returns.
//
// A conversion job takes a filesystem PATH rather than requiring the
// whole file's bytes to be re-uploaded through JSON (the point of
// streaming conversion is defeated if the frontend has to base64-encode a
// multi-gigabyte archive first), so this endpoint has to independently
// re-establish that the path it was handed really did come from that
// dialog and not from a compromised renderer guessing at
// "C:\Users\...\Documents\taxes.pdf". RegisterPickedPaths is the only way
// a path becomes eligible: trusted, in-process Go code that itself
// invoked the picker calls it directly (an ordinary function call, never
// an HTTP route -- an HTTP endpoint reachable from the renderer would BE
// the vulnerability this exists to prevent). Until something calls it,
// every job and probe request is refused, fail-closed, rather than
// silently accepting arbitrary paths.
const pickedPathTTL = 10 * time.Minute

func (m *convertManager) registerPickedPaths(paths []string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now()
	for _, p := range paths {
		abs, err := filepath.Abs(p)
		if err != nil {
			continue
		}
		m.pickedPaths[abs] = now.Add(pickedPathTTL)
	}
}

// pathIsPicked reports whether path was registered by RegisterPickedPaths
// within the last pickedPathTTL, pruning expired entries as it goes so the
// registry never grows without bound across a long-running session.
func (m *convertManager) pathIsPicked(path string) bool {
	abs, err := filepath.Abs(path)
	if err != nil {
		return false
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now()
	for p, expires := range m.pickedPaths {
		if now.After(expires) {
			delete(m.pickedPaths, p)
		}
	}
	expires, ok := m.pickedPaths[abs]
	return ok && now.Before(expires)
}

// RegisterPickedPaths marks paths as issued by the native OS file picker
// and eligible for a probe/conversion job for pickedPathTTL. It must only
// ever be called from trusted in-process Go code that itself invoked the
// picker (see app/cmd/app/webview.go's selectFiles binding) -- never wired
// to an HTTP route, since that would hand a compromised renderer the
// exact bypass this mechanism exists to prevent.
//
// As of this lane, nothing in the codebase calls this yet:
// app/cmd/app/webview.go's selectFiles binding is outside this lane's
// allowed paths (see the file converter task brief) and needs exactly one
// added line -- something like
// `uiServer.RegisterPickedPaths([]string{filename})` alongside its
// existing per-file loop -- to complete the wiring. Until that lands, the
// converter's path-based probe and job endpoints correctly, safely refuse
// every request rather than accepting an unauthorized path.
func (s *Server) RegisterPickedPaths(paths []string) {
	s.convertManager().registerPickedPaths(paths)
}

// ============================================================================
// Job queue: persistence, dispatch, SSE fan-out
// ============================================================================

type ConvertJobState string

const (
	ConvertQueued    ConvertJobState = "queued"
	ConvertRunning   ConvertJobState = "running"
	ConvertCompleted ConvertJobState = "completed"
	ConvertFailed    ConvertJobState = "failed"
	ConvertCanceled  ConvertJobState = "canceled"
)

// ConvertJob is the persisted, JSON-serialized shape of one conversion
// job.
type ConvertJob struct {
	ID            string            `json:"id"`
	InputPath     string            `json:"inputPath"`
	InputFilename string            `json:"inputFilename"`
	SourceFormat  string            `json:"sourceFormat"`
	TargetFormat  string            `json:"targetFormat"`
	OutputPath    string            `json:"outputPath,omitempty"`
	State         ConvertJobState   `json:"state"`
	Message       string            `json:"message,omitempty"`
	LossReport    ConvertLossReport `json:"lossReport"`
	Acknowledged  bool              `json:"acknowledged"`
	Error         string            `json:"error,omitempty"`
	InputBytes    int64             `json:"inputBytes,omitempty"`
	OutputBytes   int64             `json:"outputBytes,omitempty"`
	CreatedAt     time.Time         `json:"createdAt"`
	UpdatedAt     time.Time         `json:"updatedAt"`

	// tempOutputPath is the not-yet-renamed staging file for a running or
	// interrupted job. It is persisted (unlike a purely in-memory field)
	// specifically so that a job left "running" when the process exits
	// can have its orphaned temp file found and removed on the next
	// startup, per this lane's resumable-at-job-granularity contract.
	TempOutputPath string `json:"tempOutputPath,omitempty"`
}

type convertJobRuntime struct {
	job    ConvertJob
	cancel context.CancelFunc
}

type convertQueueFile struct {
	Version int          `json:"version"`
	Jobs    []ConvertJob `json:"jobs"`
}

type convertManager struct {
	mu    sync.Mutex
	jobs  map[string]*convertJobRuntime
	order []string

	path   string
	loaded bool

	subscribers map[chan convertQueueEvent]struct{}
	activeCount int

	pickedPaths map[string]time.Time
}

// convertMaxConcurrency bounds simultaneous conversions: never more than
// 4, and never more than half the machine's logical CPUs (rounded down,
// floored at 1), so a big conversion queue does not starve the rest of the
// desktop app.
var convertMaxConcurrency = func() int {
	n := runtime.NumCPU() / 2
	if n < 1 {
		n = 1
	}
	if n > 4 {
		n = 4
	}
	return n
}()

// convertMaxInputBytes bounds the size of a file this build will admit to
// the queue at all. This is a preflight sanity floor, not the streaming
// guarantee itself: every adapter above already streams from disk rather
// than buffering the whole input, but a job for a genuinely enormous file
// is still rejected up front rather than left to run for hours.
const convertMaxInputBytes = 32 << 30 // 32 GiB

// convertMinFreeDiskFloor mirrors modelsMinFreeDiskFloor's role for model
// pulls: refuse to even queue a job when the destination volume is
// already essentially full.
const convertMinFreeDiskFloor = 256 << 20 // 256 MiB

var (
	convertManagerOnce sync.Once
	convertManagerInst *convertManager
)

// convertManager lazily builds the package-level singleton (a field on
// Server is out of scope for this lane's allowed edits to ui.go, which are
// limited to route registration inside Handler()) and makes sure its
// persisted queue has been loaded, including cleaning up any job left
// "running" by a process that no longer exists.
func (s *Server) convertManager() *convertManager {
	convertManagerOnce.Do(func() {
		convertManagerInst = &convertManager{
			jobs:        make(map[string]*convertJobRuntime),
			subscribers: make(map[chan convertQueueEvent]struct{}),
			pickedPaths: make(map[string]time.Time),
			path:        convertQueuePath(),
		}
	})
	m := convertManagerInst
	m.mu.Lock()
	m.loadLocked()
	m.mu.Unlock()
	return m
}

func convertQueuePath() string {
	if runtime.GOOS == "windows" {
		return filepath.Join(os.Getenv("LOCALAPPDATA"), "Ollama", "convert-queue.json")
	}
	return filepath.Join(os.Getenv("HOME"), "Library", "Application Support", "Ollama", "convert-queue.json")
}

func (m *convertManager) loadLocked() {
	if m.loaded {
		return
	}
	m.loaded = true

	data, err := os.ReadFile(m.path)
	if err != nil {
		return
	}
	var file convertQueueFile
	if json.Unmarshal(data, &file) != nil || file.Version != 1 {
		return
	}
	for _, job := range file.Jobs {
		// The process that was running this job is gone; "running" is a
		// lie at startup. Reset it to queued (this build resumes at job
		// granularity, not byte granularity: a re-dispatched job starts
		// the conversion over from the beginning) and remove its orphaned
		// temp file so a half-written file never lingers next to the
		// eventual real output.
		if job.State == ConvertRunning {
			if job.TempOutputPath != "" {
				os.Remove(job.TempOutputPath)
			}
			job.TempOutputPath = ""
			job.State = ConvertQueued
			job.Message = "Resumed after restart."
			job.UpdatedAt = time.Now()
		}
		m.jobs[job.ID] = &convertJobRuntime{job: job}
		m.order = append(m.order, job.ID)
	}
}

func (m *convertManager) persistLocked() error {
	if err := os.MkdirAll(filepath.Dir(m.path), 0o755); err != nil {
		return err
	}
	file := convertQueueFile{Version: 1, Jobs: m.itemsLocked()}
	data, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(m.path), ".convert-queue-*.json")
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

func (m *convertManager) itemsLocked() []ConvertJob {
	items := make([]ConvertJob, 0, len(m.order))
	for _, id := range m.order {
		if job, ok := m.jobs[id]; ok {
			items = append(items, job.job)
		}
	}
	return items
}

// --- SSE fan-out -----------------------------------------------------------

type convertQueueEvent struct {
	Name string
	Data any
}

func (m *convertManager) publish(ev convertQueueEvent) {
	m.mu.Lock()
	subs := make([]chan convertQueueEvent, 0, len(m.subscribers))
	for ch := range m.subscribers {
		subs = append(subs, ch)
	}
	m.mu.Unlock()
	for _, ch := range subs {
		select {
		case ch <- ev:
		default:
			// A slow subscriber must never block the whole queue; every
			// published event is a full snapshot, so it just catches up
			// on the next one.
		}
	}
}

func (m *convertManager) subscribe() (chan convertQueueEvent, func()) {
	ch := make(chan convertQueueEvent, 32)
	m.mu.Lock()
	m.subscribers[ch] = struct{}{}
	m.mu.Unlock()
	return ch, func() {
		m.mu.Lock()
		delete(m.subscribers, ch)
		m.mu.Unlock()
	}
}

// --- dispatch and the job runner --------------------------------------

// convertJobTimeout is the per-job context deadline: generous enough for
// a genuinely large archive or PDF, bounded enough that a stuck job
// cannot occupy a concurrency slot forever.
const convertJobTimeout = 6 * time.Hour

// tryDispatchLocked starts as many queued jobs as convertMaxConcurrency
// allows. Must be called with m.mu held; returns with it still held.
func (m *convertManager) tryDispatchLocked(s *Server) {
	for _, id := range m.order {
		if m.activeCount >= convertMaxConcurrency {
			return
		}
		job, ok := m.jobs[id]
		if !ok || job.job.State != ConvertQueued {
			continue
		}
		m.activeCount++
		job.job.State = ConvertRunning
		job.job.Message = ""
		job.job.UpdatedAt = time.Now()
		go m.runJob(s, id)
	}
}

// runJob drives one job through preflight, conversion, validation, and
// atomic rename. It is started as its own goroutine by tryDispatchLocked
// and must not be called with m.mu held.
func (m *convertManager) runJob(s *Server, id string) {
	m.mu.Lock()
	rt, ok := m.jobs[id]
	if !ok {
		m.activeCount--
		m.mu.Unlock()
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), convertJobTimeout)
	rt.cancel = cancel
	job := rt.job
	m.mu.Unlock()

	defer cancel()

	finish := func(state ConvertJobState, message, errMsg string, outputPath string, outputBytes int64, tempToClean string) {
		if tempToClean != "" {
			os.Remove(tempToClean)
		}
		m.mu.Lock()
		if rt, ok := m.jobs[id]; ok {
			rt.job.State = state
			rt.job.Message = message
			rt.job.Error = errMsg
			rt.job.TempOutputPath = ""
			if outputPath != "" {
				rt.job.OutputPath = outputPath
				rt.job.OutputBytes = outputBytes
			}
			rt.job.UpdatedAt = time.Now()
			rt.cancel = nil
		}
		m.activeCount--
		m.persistLocked()
		snapshot := m.itemsLocked()
		m.tryDispatchLocked(s)
		m.mu.Unlock()
		m.publish(convertQueueEvent{Name: "queue", Data: snapshot})
	}

	// --- preflight -------------------------------------------------
	info, err := os.Stat(job.InputPath)
	if err != nil {
		finish(ConvertFailed, "", fmt.Sprintf("input file is no longer accessible: %v", err), "", 0, "")
		return
	}
	if info.Size() > convertMaxInputBytes {
		finish(ConvertFailed, "", fmt.Sprintf("input is %s, over this build's %s cap", format.HumanBytes2(uint64(info.Size())), format.HumanBytes2(uint64(convertMaxInputBytes))), "", 0, "")
		return
	}

	outputDir := filepath.Dir(job.InputPath)
	base := strings.TrimSuffix(filepath.Base(job.InputPath), filepath.Ext(job.InputPath))
	ext := targetExtension(job.TargetFormat)
	finalPath := nextAvailablePath(outputDir, base+" (converted)", ext)

	if free, err := freeDiskBytes(existingDirFor(outputDir)); err == nil {
		// A conservative floor: at least the input's own size again (the
		// output could plausibly be as large, e.g. decompression or a
		// lossless re-encode) plus the absolute floor used elsewhere in
		// this app for the same kind of check (see modelsMinFreeDiskFloor).
		required := uint64(info.Size()) + convertMinFreeDiskFloor
		if free < required {
			finish(ConvertFailed, "", fmt.Sprintf("needs at least %s free on the destination volume; only %s free", format.HumanBytes2(required), format.HumanBytes2(free)), "", 0, "")
			return
		}
	}

	// --- convert -----------------------------------------------------
	tempFile, err := os.CreateTemp(outputDir, ".convert-"+id+"-*.tmp")
	if err != nil {
		finish(ConvertFailed, "", fmt.Sprintf("create temp output on destination volume: %v", err), "", 0, "")
		return
	}
	tempPath := tempFile.Name()

	m.mu.Lock()
	if rt, ok := m.jobs[id]; ok {
		rt.job.TempOutputPath = tempPath
		rt.job.InputBytes = info.Size()
	}
	m.persistLocked()
	m.mu.Unlock()

	convertErr := runConversion(ctx, job.SourceFormat, job.TargetFormat, job.InputPath, tempFile)
	tempFile.Close()

	// A canceled context is authoritative even if the underlying adapter
	// call happened to return successfully right as cancellation landed
	// (most of this build's in-process adapters are single library calls
	// that do not check ctx mid-operation -- see runConversion's package
	// doc). Only the external-adapter path and the archive entry loop
	// actually get preempted mid-run; everything else is cooperative at
	// this boundary.
	if ctx.Err() != nil {
		finish(ConvertCanceled, "Canceled.", "", "", 0, tempPath)
		return
	}
	if convertErr != nil {
		finish(ConvertFailed, "", convertErr.Error(), "", 0, tempPath)
		return
	}

	// --- validate ------------------------------------------------------
	if err := validateOutput(job.TargetFormat, tempPath); err != nil {
		finish(ConvertFailed, "", fmt.Sprintf("output failed validation and was discarded: %v", err), "", 0, tempPath)
		return
	}

	// --- atomic write: rename from a temp file already on the
	// destination volume ------------------------------------------------
	if err := os.Rename(tempPath, finalPath); err != nil {
		finish(ConvertFailed, "", fmt.Sprintf("rename output into place: %v", err), "", 0, tempPath)
		return
	}
	outInfo, statErr := os.Stat(finalPath)
	var outputBytes int64
	if statErr == nil {
		outputBytes = outInfo.Size()
	}
	finish(ConvertCompleted, "", "", finalPath, outputBytes, "")
}

// targetExtension returns the catalog's primary extension for a format ID
// (falls back to a generic ".out" for formats that declare none, such as
// "raw"), used to name a job's output file.
func targetExtension(formatID string) string {
	f, ok := findFormat(formatID)
	if !ok || len(f.Extensions) == 0 {
		return ".out"
	}
	return f.Extensions[0]
}

// nextAvailablePath returns dir/base+ext, or dir/base (2)+ext, (3), and so
// on, so a completed conversion never silently overwrites an existing
// file.
func nextAvailablePath(dir, base, ext string) string {
	candidate := filepath.Join(dir, base+ext)
	if _, err := os.Stat(candidate); err != nil {
		return candidate
	}
	for i := 2; i < 10000; i++ {
		candidate = filepath.Join(dir, fmt.Sprintf("%s (%d)%s", base, i, ext))
		if _, err := os.Stat(candidate); err != nil {
			return candidate
		}
	}
	return filepath.Join(dir, fmt.Sprintf("%s-%d%s", base, time.Now().UnixNano(), ext))
}

// ============================================================================
// HTTP handlers
// ============================================================================

func (s *Server) convertCatalogHandler(w http.ResponseWriter, r *http.Request) error {
	if r.Method != http.MethodGet {
		return errors.New("method not allowed")
	}
	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(map[string]any{"categories": convertCatalog()})
}

type convertProbeRequest struct {
	Path string `json:"path"`
	// TargetFormat is optional. When set, the response's LossReport
	// discloses exactly what converting the probed source to this target
	// would do, before the caller ever attempts POST /jobs -- the same
	// disclosure job creation itself enforces an acknowledgement for.
	TargetFormat string `json:"targetFormat,omitempty"`
}

func (s *Server) convertProbeHandler(w http.ResponseWriter, r *http.Request) error {
	if r.Method != http.MethodPost {
		return errors.New("method not allowed")
	}
	var req convertProbeRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 8*1024)).Decode(&req); err != nil {
		return fmt.Errorf("invalid probe request: %w", err)
	}
	if strings.TrimSpace(req.Path) == "" {
		return errors.New("path is required")
	}
	if !s.convertManager().pathIsPicked(req.Path) {
		return errors.New("this path was not supplied by the file picker (or the picker's authorization has expired); reselect the file")
	}
	result, err := probeFile(req.Path)
	if err != nil {
		return err
	}
	if target := strings.TrimSpace(req.TargetFormat); target != "" && result.SourceFormat != "" {
		loss := lossReportFor(result.SourceFormat, target)
		result.LossReport = &loss
	}
	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(result)
}

type convertJobRequest struct {
	Path             string `json:"path"`
	SourceFormat     string `json:"sourceFormat,omitempty"`
	TargetFormat     string `json:"targetFormat"`
	AcknowledgeLossy bool   `json:"acknowledgeLossy"`
}

func (s *Server) convertJobsHandler(w http.ResponseWriter, r *http.Request) error {
	switch r.Method {
	case http.MethodGet:
		m := s.convertManager()
		m.mu.Lock()
		items := m.itemsLocked()
		m.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		return json.NewEncoder(w).Encode(map[string]any{"jobs": items})
	case http.MethodPost:
		return s.createConvertJob(w, r)
	default:
		return errors.New("method not allowed")
	}
}

func (s *Server) createConvertJob(w http.ResponseWriter, r *http.Request) error {
	var req convertJobRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 16*1024)).Decode(&req); err != nil {
		return fmt.Errorf("invalid job request: %w", err)
	}
	req.Path = strings.TrimSpace(req.Path)
	if req.Path == "" {
		return errors.New("path is required")
	}
	req.TargetFormat = strings.TrimSpace(req.TargetFormat)
	if req.TargetFormat == "" {
		return errors.New("targetFormat is required")
	}

	m := s.convertManager()
	if !m.pathIsPicked(req.Path) {
		return errors.New("this path was not supplied by the file picker (or the picker's authorization has expired); reselect the file")
	}

	dstFormat, ok := findFormat(req.TargetFormat)
	if !ok {
		return fmt.Errorf("unknown target format %q", req.TargetFormat)
	}
	if !dstFormat.Available {
		return fmt.Errorf("%s is not available offline: missing %s (expected at %s)", dstFormat.Label, dstFormat.MissingDependency, dstFormat.ExpectedPath)
	}
	if req.TargetFormat == "webp" {
		return errors.New("this build cannot encode WebP; only WebP decoding (import) is available offline")
	}

	srcID := strings.TrimSpace(req.SourceFormat)
	var probeWarnings []string
	if srcID == "" {
		probed, err := probeFile(req.Path)
		if err != nil {
			return err
		}
		if probed.SourceFormat == "" {
			return errors.New("could not determine the source format; specify sourceFormat explicitly")
		}
		srcID = probed.SourceFormat
		probeWarnings = probed.Warnings
	}
	srcFormat, ok := findFormat(srcID)
	if !ok {
		return fmt.Errorf("unknown source format %q", srcID)
	}
	if !srcFormat.Available {
		return fmt.Errorf("%s is not available offline: missing %s (expected at %s)", srcFormat.Label, srcFormat.MissingDependency, srcFormat.ExpectedPath)
	}

	loss := lossReportFor(srcID, req.TargetFormat)
	if loss.Lossy && !req.AcknowledgeLossy {
		return &convertAcknowledgeError{LossReport: loss}
	}

	info, err := os.Stat(req.Path)
	if err != nil {
		return fmt.Errorf("cannot access %q: %w", req.Path, err)
	}
	if info.Size() > convertMaxInputBytes {
		return fmt.Errorf("input is %s, over this build's %s cap", format.HumanBytes2(uint64(info.Size())), format.HumanBytes2(uint64(convertMaxInputBytes)))
	}

	id := uuid.NewString()
	now := time.Now()
	job := ConvertJob{
		ID:            id,
		InputPath:     req.Path,
		InputFilename: filepath.Base(req.Path),
		SourceFormat:  srcID,
		TargetFormat:  req.TargetFormat,
		State:         ConvertQueued,
		Message:       "Queued.",
		LossReport:    loss,
		Acknowledged:  req.AcknowledgeLossy,
		InputBytes:    info.Size(),
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	if len(probeWarnings) > 0 {
		job.Message = strings.Join(probeWarnings, " ")
	}

	m.mu.Lock()
	m.jobs[id] = &convertJobRuntime{job: job}
	m.order = append(m.order, id)
	m.persistLocked()
	m.tryDispatchLocked(s)
	snapshot := m.itemsLocked()
	current := m.jobs[id].job
	m.mu.Unlock()

	m.publish(convertQueueEvent{Name: "queue", Data: snapshot})

	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(current)
}

// convertAcknowledgeError is returned (as a normal error via the errHandlerFunc
// contract, which renders it through handleError as {"error": "..."}) when a
// job would be lossy and the caller has not set AcknowledgeLossy. The
// reasons are folded into the error string itself, since s.handleError only
// ever serializes Error() -- the frontend is expected to have already
// called /probe (which returns the same reasons via a fresh /probe-shaped
// disclosure) before offering the acknowledgement checkbox in the first
// place.
type convertAcknowledgeError struct {
	LossReport ConvertLossReport
}

func (e *convertAcknowledgeError) Error() string {
	reason := "this conversion loses information"
	if len(e.LossReport.Reasons) > 0 {
		reason = strings.Join(e.LossReport.Reasons, " ")
	}
	if e.LossReport.Irreversible {
		reason += " This cannot be undone."
	}
	return reason + " Set acknowledgeLossy to true to proceed."
}

func (s *Server) convertJobEventsHandler(w http.ResponseWriter, r *http.Request) error {
	m := s.convertManager()
	m.mu.Lock()
	snapshot := m.itemsLocked()
	m.mu.Unlock()

	ch, unsubscribe := m.subscribe()
	defer unsubscribe()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	flusher, ok := w.(http.Flusher)
	if !ok {
		return errors.New("streaming is not supported")
	}

	write := func(name string, data any) {
		payload, _ := json.Marshal(data)
		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", name, payload)
		flusher.Flush()
	}

	write("snapshot", snapshot)

	for {
		select {
		case ev, ok := <-ch:
			if !ok {
				return nil
			}
			write(ev.Name, ev.Data)
		case <-r.Context().Done():
			return nil
		}
	}
}

func (s *Server) convertJobCancelHandler(w http.ResponseWriter, r *http.Request) error {
	if r.Method != http.MethodPost {
		return errors.New("method not allowed")
	}
	id := r.PathValue("id")
	m := s.convertManager()

	m.mu.Lock()
	rt, ok := m.jobs[id]
	if !ok {
		m.mu.Unlock()
		return fmt.Errorf("conversion job %q not found", id)
	}

	switch rt.job.State {
	case ConvertRunning:
		cancel := rt.cancel
		m.mu.Unlock()
		if cancel != nil {
			cancel()
		}
		return json.NewEncoder(w).Encode(map[string]string{"state": "cancel_requested"})

	case ConvertCompleted, ConvertFailed, ConvertCanceled:
		state := rt.job.State
		m.mu.Unlock()
		return fmt.Errorf("job is already %q", state)

	default: // queued: no goroutine is running, finalize inline.
		rt.job.State = ConvertCanceled
		rt.job.Message = "Canceled."
		rt.job.UpdatedAt = time.Now()
		m.persistLocked()
		snapshot := m.itemsLocked()
		m.mu.Unlock()

		m.publish(convertQueueEvent{Name: "queue", Data: snapshot})
		return json.NewEncoder(w).Encode(map[string]string{"state": "canceled"})
	}
}

func (s *Server) convertJobDeleteHandler(w http.ResponseWriter, r *http.Request) error {
	if r.Method != http.MethodDelete {
		return errors.New("method not allowed")
	}
	id := r.PathValue("id")
	m := s.convertManager()

	m.mu.Lock()
	rt, ok := m.jobs[id]
	if !ok {
		m.mu.Unlock()
		return fmt.Errorf("conversion job %q not found", id)
	}
	if rt.job.State == ConvertRunning {
		m.mu.Unlock()
		return errors.New("cancel the job before deleting it")
	}
	tempPath := rt.job.TempOutputPath
	delete(m.jobs, id)
	m.order = slicesDeleteString(m.order, id)
	m.persistLocked()
	snapshot := m.itemsLocked()
	m.mu.Unlock()

	if tempPath != "" {
		os.Remove(tempPath)
	}
	m.publish(convertQueueEvent{Name: "queue", Data: snapshot})
	return json.NewEncoder(w).Encode(map[string]string{"state": "deleted"})
}

// slicesDeleteString returns order with every occurrence of id removed,
// preserving the relative order of everything else.
func slicesDeleteString(order []string, id string) []string {
	out := order[:0]
	for _, v := range order {
		if v != id {
			out = append(out, v)
		}
	}
	return out
}
