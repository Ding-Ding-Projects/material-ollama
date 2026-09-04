//go:build windows || darwin

package updater

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func updateTestConfig(t *testing.T) {
	t.Helper()
	oldURL, oldStage, oldState, oldVersion := UpdateCheckURLBase, UpdateStageDir, UpdateStateFile, currentVersionForUpdater
	UpdateStageDir = t.TempDir()
	UpdateStateFile = filepath.Join(t.TempDir(), "state.json")
	currentVersionForUpdater = func() string { return "1.0.0" }
	t.Cleanup(func() {
		UpdateCheckURLBase, UpdateStageDir, UpdateStateFile, currentVersionForUpdater = oldURL, oldStage, oldState, oldVersion
	})
}

type feedFixture struct {
	server         *httptest.Server
	pkg            ValidatedPackage
	manifest       ReleaseManifest
	payload        []byte
	mu             sync.Mutex
	mutate         func(*ReleaseManifest)
	packageHandler http.HandlerFunc
	noManifest     bool
}

func packageBytes(t *testing.T, extra map[string][]byte) []byte {
	t.Helper()
	var b bytes.Buffer
	z := zip.NewWriter(&b)
	arch := expectedUpdaterArchitecture()
	id := packageIDForArchitecture(arch)
	receipt, _ := json.Marshal(packageVersion{1, "1.2.3", strings.Repeat("a", 40), arch, id, "ollama app.exe"})
	pe := make([]byte, 70)
	copy(pe, "MZ")
	binary.LittleEndian.PutUint32(pe[60:64], 64)
	copy(pe[64:], "PE\x00\x00")
	machine := uint16(0x8664)
	if arch == "arm64" {
		machine = 0xaa64
	}
	binary.LittleEndian.PutUint16(pe[68:], machine)
	files := map[string][]byte{id + ".nuspec": []byte("<package><metadata><id>" + id + "</id><version>1.2.3</version></metadata></package>"), "lib/net45/package-version.json": receipt, "lib/net45/ollama app.exe": pe}
	for k, v := range extra {
		files[k] = v
	}
	for k, v := range files {
		w, e := z.Create(k)
		if e != nil {
			t.Fatal(e)
		}
		if _, e = w.Write(v); e != nil {
			t.Fatal(e)
		}
	}
	if e := z.Close(); e != nil {
		t.Fatal(e)
	}
	return b.Bytes()
}
func newFeedFixture(t *testing.T) *feedFixture {
	t.Helper()
	f := &feedFixture{payload: packageBytes(t, nil)}
	arch := expectedUpdaterArchitecture()
	id := packageIDForArchitecture(arch)
	name := id + "-1.2.3-full.nupkg"
	h1, h256 := sha1.Sum(f.payload), sha256.Sum256(f.payload)
	releases := []byte(fmt.Sprintf("%x %s %d\n", h1, name, len(f.payload)))
	rh := sha256.Sum256(releases)
	f.manifest = ReleaseManifest{1, "1.2.3", strings.Repeat("a", 40), map[string]ArchitectureManifest{arch: {PackageID: id, Setup: AssetRecord{Name: "Setup.exe", SHA256: strings.Repeat("a", 64), Size: 10}, Releases: AssetRecord{Name: "MaterialOllama-" + arch + "-RELEASES", SHA256: hex.EncodeToString(rh[:]), Size: int64(len(releases))}, Packages: []AssetRecord{{Name: name, SHA256: hex.EncodeToString(h256[:]), SHA1: hex.EncodeToString(h1[:]), Size: int64(len(f.payload)), Kind: "full"}}}}}
	f.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		m := f.manifest
		mutate, handler, noManifest := f.mutate, f.packageHandler, f.noManifest
		f.mu.Unlock()
		switch r.URL.Path {
		case "/latest":
			assets := []map[string]any{}
			for _, a := range []AssetRecord{m.Architectures[arch].Setup, m.Architectures[arch].Releases, m.Architectures[arch].Packages[0]} {
				assets = append(assets, map[string]any{"name": a.Name, "browser_download_url": f.server.URL + "/" + a.Name, "size": a.Size})
			}
			if !noManifest {
				assets = append(assets, map[string]any{"name": manifestName, "browser_download_url": f.server.URL + "/" + manifestName, "size": 100})
			}
			json.NewEncoder(w).Encode(map[string]any{"tag_name": "v1.2.3", "html_url": f.server.URL + "/notes", "assets": assets})
		case "/" + manifestName:
			if mutate != nil {
				mutate(&m)
			}
			json.NewEncoder(w).Encode(m)
		case "/MaterialOllama-" + arch + "-RELEASES":
			w.Write(releases)
		case "/" + name:
			if handler != nil {
				handler(w, r)
			} else {
				w.Write(f.payload)
			}
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(f.server.Close)
	u, _ := url.Parse(f.server.URL + "/" + name)
	f.pkg = ValidatedPackage{SourceCommit: strings.Repeat("a", 40), Version: "1.2.3", Architecture: arch, Filename: name, URL: u, SHA1: hex.EncodeToString(h1[:]), SHA256: hex.EncodeToString(h256[:]), Size: int64(len(f.payload)), ReleaseNotesURL: f.server.URL + "/notes", Releases: releases}
	UpdateCheckURLBase = f.server.URL + "/latest"
	return f
}
func awaitState(t *testing.T, u *Updater, want UpdateState) UpdateStatus {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		s := u.Status()
		if s.State == want {
			return s
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("state %s, want %s", u.Status().State, want)
	return UpdateStatus{}
}
func TestSquirrelDiscoveryStageReloadAndTamper(t *testing.T) {
	updateTestConfig(t)
	f := newFeedFixture(t)
	u := &Updater{}
	if st, e := u.CheckForUpdates(t.Context()); e != nil || st.State != UpdateAvailable {
		t.Fatalf("check %v %v", st, e)
	}
	if st, e := u.DownloadCurrent(t.Context()); e != nil || !st.CanRestart || st.State != UpdateReadyToRestart {
		t.Fatalf("download %v %v", st, e)
	}
	m := u.machine()
	if e := validateStagedPackage(m.directory, f.pkg); e != nil {
		t.Fatal(e)
	}
	reloaded := &Updater{}
	if !reloaded.Status().CanRestart {
		t.Fatalf("reload %v", reloaded.Status())
	}
	u.DeferUpdate()
	if got := (&Updater{}).Status(); got.State != UpdateDeferred || !got.CanRestart {
		t.Fatalf("later reload %v", got)
	}
	if e := os.WriteFile(filepath.Join(m.directory, f.pkg.Filename), []byte("changed"), 0600); e != nil {
		t.Fatal(e)
	}
	if got := (&Updater{}).Status(); got.CanRestart {
		t.Fatal("tampered package accepted on reload")
	}
	if _, e := u.InstallUpdate(t.Context(), false); e == nil || u.Status().State != UpdateCorruptPackage {
		t.Fatal("tampered package accepted at install")
	}
}
func TestSquirrelNoUpdateAndMissingLegacyFeed(t *testing.T) {
	updateTestConfig(t)
	f := newFeedFixture(t)
	currentVersionForUpdater = func() string { return "1.2.3" }
	u := &Updater{}
	if s, e := u.CheckForUpdates(t.Context()); e != nil || s.State != UpdateUpToDate {
		t.Fatalf("no update %v %v", s, e)
	}
	f.noManifest = true
	if s, e := u.CheckForUpdates(t.Context()); e == nil || s.State != UpdateUnavailable {
		t.Fatalf("legacy feed %v %v", s, e)
	}
}
func TestSquirrelInvalidVersionProvenance(t *testing.T) {
	updateTestConfig(t)
	newFeedFixture(t)
	currentVersionForUpdater = func() string { return "" }
	if s, e := (&Updater{}).CheckForUpdates(t.Context()); e == nil || s.ErrorCode != "version-unavailable" {
		t.Fatalf("%v %v", s, e)
	}
}
func TestSquirrelManifestValidation(t *testing.T) {
	for _, tc := range []struct {
		name   string
		mutate func(*ReleaseManifest)
	}{
		{"schema", func(m *ReleaseManifest) { m.SchemaVersion = 2 }}, {"version", func(m *ReleaseManifest) { m.Version = "1.2.3-beta" }}, {"commit", func(m *ReleaseManifest) { m.SourceCommit = "unknown" }}, {"architecture", func(m *ReleaseManifest) { m.Architectures = nil }}, {"identity", func(m *ReleaseManifest) {
			a := m.Architectures[expectedUpdaterArchitecture()]
			a.PackageID = "Other"
			m.Architectures = map[string]ArchitectureManifest{expectedUpdaterArchitecture(): a}
		}}, {"hash", func(m *ReleaseManifest) {
			a := m.Architectures[expectedUpdaterArchitecture()]
			a.Releases.SHA256 = strings.Repeat("0", 64)
			m.Architectures = map[string]ArchitectureManifest{expectedUpdaterArchitecture(): a}
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			updateTestConfig(t)
			f := newFeedFixture(t)
			f.mutate = tc.mutate
			if s, e := (&Updater{}).CheckForUpdates(t.Context()); e == nil || s.State != UpdateInvalidMetadata {
				t.Fatalf("%v %v", s, e)
			}
		})
	}
}
func TestSquirrelReleaseRowBoundaries(t *testing.T) {
	hash := strings.Repeat("a", 40)
	for _, body := range []string{"", hash + " 4 x.nupkg", hash + " ../x.nupkg 4", hash + " x.nupkg -1", hash + " x.nupkg 4\n" + hash + " x.nupkg 4"} {
		if _, e := parseReleaseRows([]byte(body)); e == nil {
			t.Fatal("invalid RELEASES accepted")
		}
	}
	if _, e := parseReleaseRows([]byte(hash + " x.nupkg 4\r\n")); e != nil {
		t.Fatal(e)
	}
}
func TestSquirrelURLAndRedirectBoundaries(t *testing.T) {
	for _, raw := range []string{"http://example.com/a", "https://evil.test/a", "https://github.com:444/a", "https://user:pass@github.com/a", "https://github.com/a#fragment"} {
		if _, e := validateUpdateURL(raw, true); e == nil {
			t.Fatal("unsafe URL accepted")
		}
	}
	u, _ := url.Parse("https://release-assets.githubusercontent.com/a?download=1")
	if e := updateRedirect(&http.Request{URL: u}, []*http.Request{{}}); e != nil {
		t.Fatal(e)
	}
	u, _ = url.Parse("http://127.0.0.1/a")
	if e := updateRedirect(&http.Request{URL: u}, []*http.Request{{}}); e == nil {
		t.Fatal("loopback redirect accepted")
	}
}
func TestSquirrelCancelInvalidatesStaleDownload(t *testing.T) {
	updateTestConfig(t)
	f := newFeedFixture(t)
	started := make(chan struct{})
	f.packageHandler = func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		w.(http.Flusher).Flush()
		close(started)
		<-r.Context().Done()
	}
	u := &Updater{}
	if _, e := u.CheckForUpdates(t.Context()); e != nil {
		t.Fatal(e)
	}
	if _, e := u.StartDownload(t.Context()); e != nil {
		t.Fatal(e)
	}
	<-started
	u.CancelUpdate()
	awaitState(t, u, UpdateCancelled)
	time.Sleep(50 * time.Millisecond)
	if u.Status().State != UpdateCancelled {
		t.Fatal("stale download replaced cancelled state")
	}
}
func TestSquirrelConcurrentInitialization(t *testing.T) {
	updateTestConfig(t)
	u := &Updater{}
	var wg sync.WaitGroup
	for i := 0; i < 30; i++ {
		wg.Go(func() {
			for j := 0; j < 20; j++ {
				u.Status()
			}
		})
	}
	wg.Wait()
}
func TestSquirrelStaleCheckCannotOverwrite(t *testing.T) {
	updateTestConfig(t)
	var calls atomic.Int32
	started := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			close(started)
			<-r.Context().Done()
			return
		}
		w.Write([]byte("{"))
	}))
	defer srv.Close()
	UpdateCheckURLBase = srv.URL + "/latest"
	u := &Updater{}
	done := make(chan struct{})
	go func() { u.CheckForUpdates(context.Background()); close(done) }()
	<-started
	u.CheckForUpdates(t.Context())
	<-done
	if u.Status().State != UpdateInvalidMetadata {
		t.Fatal("stale check replaced current status")
	}
}
func TestSquirrelCorruptContentAndHash(t *testing.T) {
	for _, kind := range []string{"hash", "archive"} {
		t.Run(kind, func(t *testing.T) {
			updateTestConfig(t)
			f := newFeedFixture(t)
			p := f.pkg
			if kind == "hash" {
				p.SHA256 = strings.Repeat("0", 64)
			} else {
				f.payload = []byte("not a package")
				a, b := sha1.Sum(f.payload), sha256.Sum256(f.payload)
				p.Size = int64(len(f.payload))
				p.SHA1 = hex.EncodeToString(a[:])
				p.SHA256 = hex.EncodeToString(b[:])
				p.Releases = []byte(fmt.Sprintf("%s %s %d\n", p.SHA1, p.Filename, p.Size))
			}
			u := &Updater{}
			if s, e := u.DownloadValidatedPackage(t.Context(), p); e == nil || s.CanRestart {
				t.Fatalf("bad package accepted %v %v", s, e)
			}
		})
	}
}
func TestSquirrelUnsafeArchiveAndProvenance(t *testing.T) {
	for _, extra := range []map[string][]byte{{"../escaped": []byte("x")}, {"lib/net45/package-version.json": []byte(`{}`)}} {
		updateTestConfig(t)
		f := newFeedFixture(t)
		f.payload = packageBytes(t, extra)
		p := f.pkg
		a, b := sha1.Sum(f.payload), sha256.Sum256(f.payload)
		p.Size = int64(len(f.payload))
		p.SHA1 = hex.EncodeToString(a[:])
		p.SHA256 = hex.EncodeToString(b[:])
		p.Releases = []byte(fmt.Sprintf("%s %s %d\n", p.SHA1, p.Filename, p.Size))
		if s, e := (&Updater{}).DownloadValidatedPackage(t.Context(), p); e == nil || s.CanRestart {
			t.Fatal("unsafe archive accepted")
		}
	}
}
func TestSquirrelUnsavedWorkPreservesReadyReceipt(t *testing.T) {
	updateTestConfig(t)
	f := newFeedFixture(t)
	u := &Updater{}
	if _, e := u.DownloadValidatedPackage(t.Context(), f.pkg); e != nil {
		t.Fatal(e)
	}
	if _, e := u.InstallUpdate(t.Context(), true); e == nil || !u.Status().CanRestart {
		t.Fatal("unsaved work did not preserve ready state")
	}
}
func TestSquirrelStatusExcludesPrivatePathsAndPersistenceFailure(t *testing.T) {
	updateTestConfig(t)
	f := newFeedFixture(t)
	u := &Updater{}
	u.DownloadValidatedPackage(t.Context(), f.pkg)
	b, _ := json.Marshal(u.Status())
	if bytes.Contains(b, []byte(UpdateStageDir)) || bytes.Contains(b, []byte("packagePath")) {
		t.Fatal("private staging metadata exposed")
	}
	UpdateStateFile = UpdateStageDir
	u.DeferUpdate()
	if !u.Status().PersistenceError {
		t.Fatal("state write failure hidden")
	}
}
