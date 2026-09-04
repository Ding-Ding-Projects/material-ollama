//go:build windows || darwin

package updater

import (
	"archive/zip"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/xml"
	"errors"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/ollama/ollama/app/version"
)

type packageVersion struct {
	SchemaVersion int    `json:"schemaVersion"`
	Version       string `json:"version"`
	SourceCommit  string `json:"sourceCommit"`
	Architecture  string `json:"architecture"`
	PackageID     string `json:"packageId"`
	EntryPoint    string `json:"entryPoint"`
}

func validPackageVersion(v packageVersion) bool {
	return v.SchemaVersion == 1 && validVersion(v.Version) && validHash(v.SourceCommit, 20) && v.Architecture == expectedUpdaterArchitecture() && v.PackageID == packageIDForArchitecture(v.Architecture) && v.EntryPoint == "ollama app.exe"
}

var currentVersionForUpdater = func() string {
	exe, e := os.Executable()
	if e == nil {
		b, e := readBoundedFile(filepath.Join(filepath.Dir(exe), "package-version.json"), 4096)
		if e == nil {
			var v packageVersion
			if decodeStrict(b, &v) == nil && validPackageVersion(v) && filepath.Base(filepath.Dir(exe)) == "app-"+v.Version {
				return v.Version
			}
		}
	}
	if validVersion(version.Version) {
		return version.Version
	}
	return ""
}

func validatePackageRecord(p ValidatedPackage) error {
	if !validHash(p.SourceCommit, 20) || !validVersion(p.Version) || p.Architecture != expectedUpdaterArchitecture() || p.Filename != packageIDForArchitecture(p.Architecture)+"-"+p.Version+"-full.nupkg" || p.URL == nil || p.Size <= 0 || p.Size > maxPackageBytes || !validHash(p.SHA1, 20) || !validHash(p.SHA256, 32) {
		return errors.New("invalid package identity or bounds")
	}
	if _, e := validateUpdateURL(p.URL.String(), true); e != nil {
		return e
	}
	rows, e := parseReleaseRows(p.Releases)
	if e != nil || len(rows) != 1 {
		return errors.New("local feed must contain exactly one full package")
	}
	if rows[0].Filename != p.Filename || rows[0].Size != p.Size || !strings.EqualFold(rows[0].SHA1, p.SHA1) {
		return errors.New("local feed differs from package")
	}
	return nil
}
func validateStagedPackage(dir string, p ValidatedPackage) error {
	if e := validatePackageRecord(p); e != nil {
		return e
	}
	root, e := filepath.Abs(UpdateStageDir)
	if e != nil {
		return e
	}
	abs, e := filepath.Abs(dir)
	if e != nil {
		return e
	}
	if filepath.Dir(abs) != root || !strings.HasPrefix(filepath.Base(abs), "stage-") {
		return errors.New("invalid staging directory")
	}
	for _, name := range []string{root, abs, filepath.Join(abs, p.Filename), filepath.Join(abs, "RELEASES")} {
		info, e := os.Lstat(name)
		if e != nil {
			return e
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return errors.New("staging link is not allowed")
		}
	}
	f, e := os.Open(filepath.Join(abs, p.Filename))
	if e != nil {
		return e
	}
	defer f.Close()
	info, e := f.Stat()
	if e != nil {
		return e
	}
	if !info.Mode().IsRegular() || info.Size() != p.Size {
		return errors.New("staged package length changed")
	}
	h1, h256 := sha1.New(), sha256.New()
	if _, e := io.Copy(io.MultiWriter(h1, h256), io.LimitReader(f, p.Size+1)); e != nil {
		return e
	}
	if !strings.EqualFold(hex.EncodeToString(h1.Sum(nil)), p.SHA1) || !strings.EqualFold(hex.EncodeToString(h256.Sum(nil)), p.SHA256) {
		return errors.New("staged package hash changed")
	}
	releases, e := readBoundedFile(filepath.Join(abs, "RELEASES"), maxReleasesBytes)
	if e != nil {
		return e
	}
	if string(releases) != string(p.Releases) {
		return errors.New("staged RELEASES changed")
	}
	z, e := zip.NewReader(f, info.Size())
	if e != nil {
		return errors.New("invalid NuGet archive")
	}
	if len(z.File) > 100000 {
		return errors.New("archive entry bound exceeded")
	}
	seen := map[string]bool{}
	var expanded uint64
	haveExe, haveReceipt, haveNuspec := false, false, false
	for _, entry := range z.File {
		n := entry.Name
		clean := path.Clean(n)
		key := strings.ToLower(clean)
		if strings.ContainsAny(n, `\:`) || strings.HasPrefix(n, "/") || clean == ".." || strings.HasPrefix(clean, "../") || seen[key] || entry.Mode()&os.ModeSymlink != 0 {
			return errors.New("unsafe archive path")
		}
		seen[key] = true
		expanded += entry.UncompressedSize64
		if expanded > 32<<30 || entry.UncompressedSize64 > 16<<30 {
			return errors.New("archive expanded bound exceeded")
		}
		if key == "lib/net45/ollama app.exe" {
			r, e := entry.Open()
			if e != nil {
				return e
			}
			header := make([]byte, 64)
			_, e = io.ReadFull(r, header)
			if e != nil || string(header[:2]) != "MZ" {
				r.Close()
				return errors.New("missing native application executable")
			}
			offset := int64(binary.LittleEndian.Uint32(header[60:64]))
			if offset < 64 || offset > 1<<20 {
				r.Close()
				return errors.New("invalid native executable header")
			}
			if _, e = io.CopyN(io.Discard, r, offset-64); e != nil {
				r.Close()
				return errors.New("truncated native executable")
			}
			peHeader := make([]byte, 6)
			_, e = io.ReadFull(r, peHeader)
			r.Close()
			machine := uint16(0x8664)
			if p.Architecture == "arm64" {
				machine = 0xaa64
			}
			if e != nil || string(peHeader[:4]) != "PE\x00\x00" || binary.LittleEndian.Uint16(peHeader[4:]) != machine {
				return errors.New("native executable architecture mismatch")
			}
			haveExe = true
		}
		if key == "lib/net45/package-version.json" {
			b, e := readZipEntry(entry, 4096)
			if e != nil {
				return e
			}
			var v packageVersion
			if decodeStrict(b, &v) != nil || !validPackageVersion(v) || v.Version != p.Version || v.SourceCommit != p.SourceCommit {
				return errors.New("package provenance mismatch")
			}
			haveReceipt = true
		}
		if strings.HasSuffix(key, ".nuspec") && !strings.Contains(key, "/") {
			b, e := readZipEntry(entry, 64<<10)
			if e != nil {
				return e
			}
			var spec struct {
				Metadata struct {
					ID      string `xml:"id"`
					Version string `xml:"version"`
				} `xml:"metadata"`
			}
			if xml.Unmarshal(b, &spec) != nil || spec.Metadata.ID != packageIDForArchitecture(p.Architecture) || spec.Metadata.Version != p.Version {
				return errors.New("NuGet identity mismatch")
			}
			if haveNuspec {
				return errors.New("duplicate NuGet specification")
			}
			haveNuspec = true
		}
	}
	if !haveExe || !haveReceipt || !haveNuspec {
		return errors.New("package missing required payload or provenance")
	}
	return nil
}
func readZipEntry(f *zip.File, limit int64) ([]byte, error) {
	if f.UncompressedSize64 > uint64(limit) {
		return nil, errors.New("archive metadata exceeds bound")
	}
	r, e := f.Open()
	if e != nil {
		return nil, e
	}
	defer r.Close()
	b, e := io.ReadAll(io.LimitReader(r, limit+1))
	if int64(len(b)) > limit {
		return nil, errors.New("archive metadata exceeds bound")
	}
	return b, e
}
