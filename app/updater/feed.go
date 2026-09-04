//go:build windows || darwin

package updater

import (
	"context"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	PackageID               = "MaterialOllama"
	PackageIDX64            = "MaterialOllamaX64"
	PackageIDArm64          = "MaterialOllamaArm64"
	DefaultReleaseURL       = "https://api.github.com/repos/Ding-Ding-Projects/material-ollama/releases/latest"
	releasePrefix           = "https://github.com/Ding-Ding-Projects/material-ollama/releases/"
	manifestName            = "material-ollama-update.json"
	maxFeedBytes            = 256 << 10
	maxReleasesBytes        = 2 << 20
	maxPackageBytes   int64 = 8 << 30
)

type UpdateState string

const (
	UpdateIdle            UpdateState = "idle"
	UpdateChecking        UpdateState = "checking"
	UpdateUpToDate        UpdateState = "up-to-date"
	UpdateUnavailable     UpdateState = "unavailable"
	UpdateAvailable       UpdateState = "available"
	UpdateDownloading     UpdateState = "downloading"
	UpdateReadyToRestart  UpdateState = "ready-to-restart"
	UpdateDeferred        UpdateState = "deferred"
	UpdateInstalling      UpdateState = "installing"
	UpdateRestarting      UpdateState = "restarting"
	UpdateCancelled       UpdateState = "cancelled"
	UpdateOffline         UpdateState = "offline"
	UpdateInvalidMetadata UpdateState = "invalid-metadata"
	UpdateHashMismatch    UpdateState = "hash-mismatch"
	UpdateCorruptPackage  UpdateState = "corrupt-package"
	UpdateError           UpdateState = "error"
)

// UpdateStatus contains no local paths or provider response bodies. The private
// receipt stores the staging directory separately from this HTTP representation.
type UpdateStatus struct {
	State              UpdateState `json:"state"`
	CurrentVersion     string      `json:"currentVersion,omitempty"`
	Version            string      `json:"version,omitempty"`
	PackageID          string      `json:"packageId,omitempty"`
	Architecture       string      `json:"architecture,omitempty"`
	BytesDownloaded    int64       `json:"bytesDownloaded,omitempty"`
	BytesTotal         int64       `json:"bytesTotal,omitempty"`
	RateBytesPerSecond int64       `json:"rateBytesPerSecond,omitempty"`
	ETASeconds         int64       `json:"etaSeconds,omitempty"`
	ReleaseNotesURL    string      `json:"releaseNotesUrl,omitempty"`
	UnsignedWarning    bool        `json:"unsignedWarning"`
	CanRestart         bool        `json:"canRestart"`
	CanLater           bool        `json:"canLater"`
	Error              string      `json:"error,omitempty"`
	ErrorCode          string      `json:"errorCode,omitempty"`
	PersistenceError   bool        `json:"persistenceError,omitempty"`
	Generation         uint64      `json:"generation"`
	UpdatedAt          time.Time   `json:"updatedAt"`
}
type ReleaseRow struct {
	SHA1     string
	Filename string
	Size     int64
}
type AssetRecord struct {
	Name   string `json:"name"`
	SHA256 string `json:"sha256"`
	SHA1   string `json:"sha1,omitempty"`
	Size   int64  `json:"size"`
	Kind   string `json:"kind,omitempty"`
}
type ArchitectureManifest struct {
	PackageID string        `json:"packageId"`
	Setup     AssetRecord   `json:"setup"`
	Releases  AssetRecord   `json:"releases"`
	Packages  []AssetRecord `json:"packages"`
}
type ReleaseManifest struct {
	SchemaVersion int                             `json:"schemaVersion"`
	Version       string                          `json:"version"`
	SourceCommit  string                          `json:"sourceCommit"`
	Architectures map[string]ArchitectureManifest `json:"architectures"`
}
type ValidatedPackage struct {
	SourceCommit    string
	Version         string
	Architecture    string
	Filename        string
	URL             *url.URL
	SHA1            string
	SHA256          string
	Size            int64
	ReleaseNotesURL string
	Releases        []byte
}
type updateReceipt struct {
	SchemaVersion int               `json:"schemaVersion"`
	Status        UpdateStatus      `json:"status"`
	Package       *ValidatedPackage `json:"package,omitempty"`
	Directory     string            `json:"directory,omitempty"`
}
type updateMachine struct {
	mu         sync.Mutex
	status     UpdateStatus
	generation uint64
	cancel     context.CancelFunc
	validated  *ValidatedPackage
	directory  string
	checkNow   chan struct{}
}

var numericVersion = regexp.MustCompile(`^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$`)

func validVersion(v string) bool {
	if !numericVersion.MatchString(v) {
		return false
	}
	for _, part := range strings.Split(v, ".") {
		if n, e := strconv.ParseUint(part, 10, 16); e != nil || n > 65535 {
			return false
		}
	}
	return true
}
func compareVersions(a, b string) int {
	aa, bb := strings.Split(a, "."), strings.Split(b, ".")
	if !validVersion(a) || !validVersion(b) {
		return 0
	}
	for i := 0; i < 3; i++ {
		x, _ := strconv.Atoi(aa[i])
		y, _ := strconv.Atoi(bb[i])
		if x < y {
			return -1
		}
		if x > y {
			return 1
		}
	}
	return 0
}
func expectedUpdaterArchitecture() string {
	if runtime.GOARCH == "amd64" {
		return "x64"
	}
	return runtime.GOARCH
}
func packageIDForArchitecture(a string) string {
	switch a {
	case "x64":
		return PackageIDX64
	case "arm64":
		return PackageIDArm64
	}
	return ""
}
func isBoundedLoopback(host string) bool {
	h, _, e := net.SplitHostPort(host)
	if e != nil {
		h = host
	}
	return h == "127.0.0.1" || h == "[::1]" || h == "::1"
}
func validateUpdateURL(raw string, allowLoopback bool) (*url.URL, error) {
	u, e := url.Parse(raw)
	if e != nil || u.Host == "" || u.User != nil || u.Fragment != "" || u.Path == "" {
		return nil, errors.New("invalid update URL")
	}
	if allowLoopback && u.Scheme == "http" && isBoundedLoopback(u.Host) {
		return u, nil
	}
	if u.Scheme != "https" || (u.Port() != "" && u.Port() != "443") {
		return nil, errors.New("update URL must use HTTPS")
	}
	switch strings.ToLower(u.Hostname()) {
	case "api.github.com", "github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com":
		return u, nil
	}
	return nil, errors.New("update host is not allowed")
}
func updateRedirect(req *http.Request, via []*http.Request) error {
	if len(via) >= 4 {
		return errors.New("too many update redirects")
	}
	u, e := validateUpdateURL(req.URL.String(), false)
	if e != nil {
		return e
	}
	if u.Hostname() != "release-assets.githubusercontent.com" && u.Hostname() != "objects.githubusercontent.com" {
		return errors.New("update redirect host is not an asset host")
	}
	return nil
}
func boundedHTTPClient() *http.Client {
	return &http.Client{Timeout: 90 * time.Second, CheckRedirect: updateRedirect}
}
func packageHTTPClient() *http.Client {
	return &http.Client{Transport: &http.Transport{Proxy: http.ProxyFromEnvironment, DialContext: (&net.Dialer{Timeout: 30 * time.Second}).DialContext, TLSHandshakeTimeout: 20 * time.Second, ResponseHeaderTimeout: 30 * time.Second}, CheckRedirect: updateRedirect}
}
func requestUpdate(ctx context.Context, client *http.Client, raw string) (*http.Response, error) {
	u, e := validateUpdateURL(raw, true)
	if e != nil {
		return nil, e
	}
	req, e := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if e != nil {
		return nil, e
	}
	req.Header.Set("User-Agent", "MaterialOllama-Updater")
	resp, e := client.Do(req)
	if e != nil {
		return nil, e
	}
	return resp, nil
}
func fetchBounded(ctx context.Context, client *http.Client, raw string, limit int64) ([]byte, *url.URL, error) {
	resp, e := requestUpdate(ctx, client, raw)
	if e != nil {
		return nil, nil, e
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, resp.Request.URL, fmt.Errorf("update endpoint status %d", resp.StatusCode)
	}
	if resp.ContentLength > limit {
		return nil, nil, errors.New("response exceeds bound")
	}
	b, e := io.ReadAll(io.LimitReader(resp.Body, limit+1))
	if e != nil {
		return nil, nil, e
	}
	if int64(len(b)) > limit {
		return nil, nil, errors.New("response exceeds bound")
	}
	return b, resp.Request.URL, nil
}
func decodeStrict(b []byte, target any) error {
	d := json.NewDecoder(strings.NewReader(string(b)))
	d.DisallowUnknownFields()
	if e := d.Decode(target); e != nil {
		return e
	}
	var extra any
	if d.Decode(&extra) != io.EOF {
		return errors.New("trailing metadata")
	}
	return nil
}
func validHash(s string, n int) bool { b, e := hex.DecodeString(s); return e == nil && len(b) == n }
func parseReleaseRows(data []byte) ([]ReleaseRow, error) {
	if len(data) > maxReleasesBytes {
		return nil, errors.New("RELEASES exceeds bound")
	}
	rows := []ReleaseRow{}
	seen := map[string]bool{}
	for _, line := range strings.Split(strings.ReplaceAll(string(data), "\r\n", "\n"), "\n") {
		f := strings.Fields(line)
		if len(f) == 0 {
			continue
		}
		if len(f) != 3 || !validHash(f[0], sha1.Size) {
			return nil, errors.New("malformed RELEASES row")
		}
		name, e := safeUpdateFilename(f[1])
		if e != nil || seen[strings.ToLower(name)] || !strings.HasSuffix(name, ".nupkg") {
			return nil, errors.New("invalid or duplicate RELEASES filename")
		}
		n, e := strconv.ParseInt(f[2], 10, 64)
		if e != nil || n <= 0 || n > maxPackageBytes {
			return nil, errors.New("invalid RELEASES size")
		}
		seen[strings.ToLower(name)] = true
		rows = append(rows, ReleaseRow{strings.ToLower(f[0]), name, n})
	}
	if len(rows) == 0 {
		return nil, errors.New("RELEASES has no rows")
	}
	return rows, nil
}

var errFeedUnavailable = errors.New("this release has no compatible unsigned update feed")

func discoverPackage(ctx context.Context, endpoint string) (ValidatedPackage, error) {
	b, _, e := fetchBounded(ctx, boundedHTTPClient(), endpoint, maxReleasesBytes)
	if e != nil {
		return ValidatedPackage{}, e
	}
	var release struct {
		Tag        string `json:"tag_name"`
		HTMLURL    string `json:"html_url"`
		Draft      bool   `json:"draft"`
		Prerelease bool   `json:"prerelease"`
		Assets     []struct {
			Name string `json:"name"`
			URL  string `json:"browser_download_url"`
			Size int64  `json:"size"`
		} `json:"assets"`
	}
	if e = json.Unmarshal(b, &release); e != nil {
		return ValidatedPackage{}, e
	}
	if release.Draft || release.Prerelease || release.Tag == "" {
		return ValidatedPackage{}, errors.New("release is not stable and published")
	}
	base := releasePrefix + "download/" + url.PathEscape(release.Tag) + "/"
	local, _ := url.Parse(endpoint)
	testOrigin := ""
	if local != nil && local.Scheme == "http" && isBoundedLoopback(local.Host) {
		testOrigin = "http://" + local.Host + "/"
	}
	assets := map[string]struct {
		URL  string
		Size int64
	}{}
	for _, a := range release.Assets {
		if _, ok := assets[a.Name]; ok {
			return ValidatedPackage{}, errors.New("duplicate release asset")
		}
		if !strings.HasPrefix(a.URL, base) && !(testOrigin != "" && strings.HasPrefix(a.URL, testOrigin)) {
			return ValidatedPackage{}, errors.New("asset belongs to another release")
		}
		assets[a.Name] = struct {
			URL  string
			Size int64
		}{a.URL, a.Size}
	}
	manifest, ok := assets[manifestName]
	if !ok {
		return ValidatedPackage{}, errFeedUnavailable
	}
	b, _, e = fetchBounded(ctx, boundedHTTPClient(), manifest.URL, maxFeedBytes)
	if e != nil {
		return ValidatedPackage{}, e
	}
	var m ReleaseManifest
	if e = decodeStrict(b, &m); e != nil {
		return ValidatedPackage{}, e
	}
	arch := expectedUpdaterArchitecture()
	a, ok := m.Architectures[arch]
	if m.SchemaVersion != 1 || !validVersion(m.Version) || !validHash(m.SourceCommit, 20) || !ok || a.PackageID != packageIDForArchitecture(arch) {
		return ValidatedPackage{}, errors.New("invalid manifest identity, version or architecture")
	}
	if len(a.Packages) == 0 || len(a.Packages) > 32 {
		return ValidatedPackage{}, errors.New("invalid package inventory")
	}
	resolve := func(record AssetRecord) (string, error) {
		v, ok := assets[record.Name]
		if !ok || v.Size != record.Size || record.Size <= 0 || record.Size > maxPackageBytes || !validHash(record.SHA256, 32) {
			return "", errors.New("asset inventory mismatch")
		}
		if _, e := safeUpdateFilename(record.Name); e != nil {
			return "", e
		}
		return v.URL, nil
	}
	if _, e := resolve(a.Setup); e != nil {
		return ValidatedPackage{}, e
	}
	releasesURL, e := resolve(a.Releases)
	if e != nil {
		return ValidatedPackage{}, e
	}
	if a.Releases.Name != "MaterialOllama-"+arch+"-RELEASES" || a.Releases.Size > maxReleasesBytes {
		return ValidatedPackage{}, errors.New("invalid RELEASES asset")
	}
	releases, _, e := fetchBounded(ctx, boundedHTTPClient(), releasesURL, maxReleasesBytes)
	if e != nil {
		return ValidatedPackage{}, e
	}
	sum := sha256.Sum256(releases)
	if int64(len(releases)) != a.Releases.Size || !strings.EqualFold(hex.EncodeToString(sum[:]), a.Releases.SHA256) {
		return ValidatedPackage{}, errors.New("RELEASES hash or length mismatch")
	}
	rows, e := parseReleaseRows(releases)
	if e != nil {
		return ValidatedPackage{}, e
	}
	fullName := a.PackageID + "-" + m.Version + "-full.nupkg"
	var selected *ValidatedPackage
	seen := map[string]bool{}
	for _, p := range a.Packages {
		raw, e := resolve(p)
		if e != nil {
			return ValidatedPackage{}, e
		}
		if seen[p.Name] || !validHash(p.SHA1, 20) || (p.Kind != "full" && p.Kind != "delta") {
			return ValidatedPackage{}, errors.New("invalid package record")
		}
		seen[p.Name] = true
		found := false
		for _, r := range rows {
			if r.Filename == p.Name {
				found = r.Size == p.Size && strings.EqualFold(r.SHA1, p.SHA1)
			}
		}
		if !found {
			return ValidatedPackage{}, errors.New("package absent from RELEASES")
		}
		if p.Kind == "full" && p.Name == fullName {
			u, _ := url.Parse(raw)
			selected = &ValidatedPackage{SourceCommit: m.SourceCommit, Version: m.Version, Architecture: arch, Filename: p.Name, URL: u, SHA1: p.SHA1, SHA256: p.SHA256, Size: p.Size, ReleaseNotesURL: release.HTMLURL, Releases: []byte(fmt.Sprintf("%s %s %d\n", p.SHA1, p.Name, p.Size))}
		}
	}
	if selected == nil {
		return ValidatedPackage{}, errors.New("compatible full package absent")
	}
	if !strings.HasPrefix(release.HTMLURL, releasePrefix+"tag/") && !(testOrigin != "" && strings.HasPrefix(release.HTMLURL, testOrigin)) {
		return ValidatedPackage{}, errors.New("invalid release notes URL")
	}
	return *selected, nil
}

func (u *Updater) machine() *updateMachine {
	u.machineMu.Lock()
	defer u.machineMu.Unlock()
	if u.machineState == nil {
		m := &updateMachine{status: UpdateStatus{State: UpdateIdle, UnsignedWarning: true, CurrentVersion: currentVersionForUpdater()}, checkNow: make(chan struct{}, 1)}
		if b, e := readBoundedFile(UpdateStateFile, maxFeedBytes); e == nil {
			var receipt updateReceipt
			if decodeStrict(b, &receipt) == nil && receipt.SchemaVersion == 1 {
				m.status = receipt.Status
				m.generation = receipt.Status.Generation
				m.validated = receipt.Package
				m.directory = receipt.Directory
				m.status.CurrentVersion = currentVersionForUpdater()
				if m.directory != "" && m.validated != nil {
					if e := validateStagedPackage(m.directory, *m.validated); e == nil && validVersion(m.status.CurrentVersion) && compareVersions(m.validated.Version, m.status.CurrentVersion) > 0 {
						m.status.CanRestart = true
						m.status.CanLater = true
						if m.status.State != UpdateDeferred {
							m.status.State = UpdateReadyToRestart
						}
					} else {
						m.directory = ""
						m.status = UpdateStatus{State: UpdateIdle, UnsignedWarning: true, CurrentVersion: currentVersionForUpdater()}
					}
				} else if m.status.State == UpdateChecking || m.status.State == UpdateDownloading || m.status.State == UpdateInstalling || m.status.State == UpdateRestarting {
					m.status.State = UpdateCancelled
					m.status.CanRestart = false
				}
			} else {
				m.status.ErrorCode = "receipt-invalid"
				m.status.Error = "Saved update state is invalid. Check for updates again."
			}
		} else if !errors.Is(e, os.ErrNotExist) && UpdateStateFile != "" {
			m.status.PersistenceError = true
		}
		u.machineState = m
	}
	return u.machineState
}
func (u *Updater) persistLocked(m *updateMachine) {
	m.status.PersistenceError = false
	if UpdateStateFile == "" {
		return
	}
	b, e := json.Marshal(updateReceipt{1, m.status, m.validated, m.directory})
	if e == nil {
		e = os.MkdirAll(filepath.Dir(UpdateStateFile), 0700)
	}
	if e == nil {
		e = writeUpdateFile(UpdateStateFile, b)
	}
	if e != nil {
		m.status.PersistenceError = true
	}
}
func (u *Updater) statusLocked(m *updateMachine, s UpdateStatus) UpdateStatus {
	s.Generation = m.generation
	s.UpdatedAt = time.Now().UTC()
	s.UnsignedWarning = true
	s.CurrentVersion = currentVersionForUpdater()
	m.status = s
	u.persistLocked(m)
	return m.status
}
func (u *Updater) setUpdateStatus(s UpdateStatus) UpdateStatus {
	m := u.machine()
	m.mu.Lock()
	defer m.mu.Unlock()
	return u.statusLocked(m, s)
}
func (u *Updater) Status() UpdateStatus {
	m := u.machine()
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.status
}
func (u *Updater) finish(g uint64, s UpdateStatus, err error) (UpdateStatus, error) {
	m := u.machine()
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.generation != g {
		return m.status, context.Canceled
	}
	if m.cancel != nil {
		m.cancel()
		m.cancel = nil
	}
	return u.statusLocked(m, s), err
}
func (u *Updater) failed(g uint64, state UpdateState, code string, err error) (UpdateStatus, error) {
	if errors.Is(err, context.Canceled) {
		state = UpdateCancelled
		code = "cancelled"
	}
	s := u.Status()
	s.State = state
	s.CanRestart = false
	s.ErrorCode = code
	s.Error = "The update could not complete. Retry the action or check the update installation."
	return u.finish(g, s, err)
}
func (u *Updater) begin(ctx context.Context, state UpdateState) (context.Context, uint64, error) {
	m := u.machine()
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.status.State == UpdateInstalling || m.status.State == UpdateRestarting {
		return nil, 0, errors.New("installation is already running")
	}
	if m.cancel != nil {
		m.cancel()
	}
	c, cancel := context.WithCancel(ctx)
	m.cancel = cancel
	m.generation++
	s := m.status
	s.State = state
	s.Error = ""
	s.ErrorCode = ""
	s.CanRestart = false
	u.statusLocked(m, s)
	return c, m.generation, nil
}
func (u *Updater) CheckForUpdates(ctx context.Context) (UpdateStatus, error) {
	c, g, e := u.begin(ctx, UpdateChecking)
	if e != nil {
		return u.Status(), e
	}
	return u.check(c, g)
}
func (u *Updater) check(ctx context.Context, g uint64) (UpdateStatus, error) {
	pkg, e := discoverPackage(ctx, UpdateCheckURLBase)
	if e != nil {
		state, code := UpdateInvalidMetadata, "invalid-metadata"
		var ne net.Error
		if errors.Is(e, errFeedUnavailable) {
			state = UpdateUnavailable
			code = "feed-unavailable"
		} else if errors.As(e, &ne) {
			state = UpdateOffline
			code = "offline"
		}
		return u.failed(g, state, code, e)
	}
	current := currentVersionForUpdater()
	if !validVersion(current) {
		return u.failed(g, UpdateUnavailable, "version-unavailable", errors.New("installed version provenance unavailable"))
	}
	m := u.machine()
	m.mu.Lock()
	if m.generation != g {
		m.mu.Unlock()
		return u.Status(), context.Canceled
	}
	m.validated = &pkg
	m.directory = ""
	m.mu.Unlock()
	s := UpdateStatus{State: UpdateAvailable, Version: pkg.Version, PackageID: packageIDForArchitecture(pkg.Architecture), Architecture: pkg.Architecture, BytesTotal: pkg.Size, ReleaseNotesURL: pkg.ReleaseNotesURL}
	if compareVersions(pkg.Version, current) <= 0 {
		s.State = UpdateUpToDate
	}
	return u.finish(g, s, nil)
}

// StartCheck and StartDownload reserve the generation synchronously, then detach
// bounded work from the short-lived HTTP request. Polling can therefore cancel it.
func (u *Updater) StartCheck(ctx context.Context) (UpdateStatus, error) {
	if st := u.Status(); st.State == UpdateReadyToRestart || st.State == UpdateDeferred {
		return st, nil
	}
	c, g, e := u.begin(ctx, UpdateChecking)
	if e != nil {
		return u.Status(), e
	}
	go u.check(c, g)
	return u.Status(), nil
}
func (u *Updater) StartDownload(ctx context.Context) (UpdateStatus, error) {
	m := u.machine()
	m.mu.Lock()
	p := m.validated
	ok := m.status.State == UpdateAvailable
	m.mu.Unlock()
	if p == nil || !ok {
		return u.Status(), errors.New("no available package")
	}
	c, g, e := u.begin(ctx, UpdateDownloading)
	if e != nil {
		return u.Status(), e
	}
	go u.download(c, g, *p)
	return u.Status(), nil
}
func (u *Updater) DownloadCurrent(ctx context.Context) (UpdateStatus, error) {
	m := u.machine()
	m.mu.Lock()
	p := m.validated
	m.mu.Unlock()
	if p == nil {
		return u.Status(), errors.New("no validated package")
	}
	return u.DownloadValidatedPackage(ctx, *p)
}
func (u *Updater) DownloadValidatedPackage(ctx context.Context, p ValidatedPackage) (UpdateStatus, error) {
	c, g, e := u.begin(ctx, UpdateDownloading)
	if e != nil {
		return u.Status(), e
	}
	return u.download(c, g, p)
}
func (u *Updater) download(ctx context.Context, g uint64, p ValidatedPackage) (UpdateStatus, error) {
	c, cancel := context.WithTimeout(ctx, 2*time.Hour)
	defer cancel()
	if e := validatePackageRecord(p); e != nil {
		return u.failed(g, UpdateInvalidMetadata, "invalid-metadata", e)
	}
	if e := os.MkdirAll(UpdateStageDir, 0700); e != nil {
		return u.failed(g, UpdateError, "storage", e)
	}
	dir, e := os.MkdirTemp(UpdateStageDir, "stage-")
	if e != nil {
		return u.failed(g, UpdateError, "storage", e)
	}
	keep := false
	defer func() {
		if !keep {
			_ = os.RemoveAll(dir)
		}
	}()
	resp, e := requestUpdate(c, packageHTTPClient(), p.URL.String())
	if e != nil {
		return u.failed(g, UpdateOffline, "offline", e)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 || resp.ContentLength > p.Size {
		return u.failed(g, UpdateError, "download", errors.New("unexpected package response"))
	}
	f, e := os.OpenFile(filepath.Join(dir, p.Filename), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if e != nil {
		return u.failed(g, UpdateError, "storage", e)
	}
	idle := time.AfterFunc(45*time.Second, cancel)
	defer idle.Stop()
	h1, h256 := sha1.New(), sha256.New()
	buf := make([]byte, 128<<10)
	var n int64
	started, last := time.Now(), time.Time{}
	reader := io.LimitReader(resp.Body, p.Size+1)
	for {
		count, re := reader.Read(buf)
		if count > 0 {
			idle.Reset(45 * time.Second)
			if _, e = f.Write(buf[:count]); e != nil {
				break
			}
			h1.Write(buf[:count])
			h256.Write(buf[:count])
			n += int64(count)
			if time.Since(last) > 250*time.Millisecond {
				m := u.machine()
				m.mu.Lock()
				if m.generation == g {
					s := m.status
					s.Version = p.Version
					s.BytesTotal = p.Size
					s.BytesDownloaded = n
					s.RateBytesPerSecond = int64(float64(n) / time.Since(started).Seconds())
					if s.RateBytesPerSecond > 0 {
						s.ETASeconds = (p.Size - n) / s.RateBytesPerSecond
					}
					s.UpdatedAt = time.Now().UTC()
					m.status = s
				}
				m.mu.Unlock()
				last = time.Now()
			}
		}
		if re == io.EOF {
			break
		}
		if re != nil {
			e = re
			break
		}
		if c.Err() != nil {
			e = c.Err()
			break
		}
	}
	closeErr := f.Close()
	if e == nil {
		e = closeErr
	}
	if e != nil {
		return u.failed(g, UpdateError, "download", e)
	}
	if n != p.Size || !strings.EqualFold(hex.EncodeToString(h1.Sum(nil)), p.SHA1) || !strings.EqualFold(hex.EncodeToString(h256.Sum(nil)), p.SHA256) {
		return u.failed(g, UpdateHashMismatch, "hash-mismatch", errors.New("package hashes or length differ"))
	}
	if e = writeUpdateFile(filepath.Join(dir, "RELEASES"), p.Releases); e != nil {
		return u.failed(g, UpdateError, "storage", e)
	}
	if e = validateStagedPackage(dir, p); e != nil {
		return u.failed(g, UpdateCorruptPackage, "corrupt-package", e)
	}
	m := u.machine()
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.generation != g || c.Err() != nil {
		return m.status, context.Canceled
	}
	m.validated = &p
	m.directory = dir
	keep = true
	if m.cancel != nil {
		m.cancel()
		m.cancel = nil
	}
	return u.statusLocked(m, UpdateStatus{State: UpdateReadyToRestart, Version: p.Version, PackageID: packageIDForArchitecture(p.Architecture), Architecture: p.Architecture, BytesDownloaded: n, BytesTotal: n, ReleaseNotesURL: p.ReleaseNotesURL, CanRestart: true, CanLater: true}), nil
}
func (u *Updater) CancelUpdate() UpdateStatus {
	m := u.machine()
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.status.State == UpdateReadyToRestart || m.status.State == UpdateDeferred {
		return m.status
	}
	if m.status.State == UpdateInstalling || m.status.State == UpdateRestarting {
		return m.status
	}
	if m.cancel != nil {
		m.cancel()
		m.cancel = nil
	}
	m.generation++
	s := m.status
	s.State = UpdateCancelled
	s.CanRestart = false
	return u.statusLocked(m, s)
}
func (u *Updater) DeferUpdate() UpdateStatus {
	m := u.machine()
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.status.State != UpdateReadyToRestart && m.status.State != UpdateDeferred {
		return m.status
	}
	s := m.status
	s.State = UpdateDeferred
	return u.statusLocked(m, s)
}
func (u *Updater) InstallUpdate(ctx context.Context, unsavedWork bool) (UpdateStatus, error) {
	m := u.machine()
	m.mu.Lock()
	if unsavedWork {
		m.mu.Unlock()
		return u.Status(), errors.New("save drafts and stop active work before restarting")
	}
	if m.status.PersistenceError || !m.status.CanRestart || m.validated == nil || m.directory == "" || (m.status.State != UpdateReadyToRestart && m.status.State != UpdateDeferred) {
		m.mu.Unlock()
		return u.Status(), errors.New("no ready package")
	}
	p, dir := *m.validated, m.directory
	if m.cancel != nil {
		m.cancel()
	}
	m.generation++
	g := m.generation
	s := m.status
	s.State = UpdateInstalling
	s.CanRestart = false
	u.statusLocked(m, s)
	m.mu.Unlock()
	if e := validateStagedPackage(dir, p); e != nil {
		return u.failed(g, UpdateCorruptPackage, "corrupt-package", e)
	}
	installCtx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()
	if e := installSquirrelPackage(installCtx, filepath.Join(dir, p.Filename)); e != nil {
		return u.failed(g, UpdateError, "install", e)
	}
	s.State = UpdateRestarting
	s.CanLater = false
	return u.finish(g, s, nil)
}
func (u *Updater) StartBackgroundUpdateStateChecker(ctx context.Context, onReady func(UpdateStatus)) <-chan struct{} {
	done := make(chan struct{})
	m := u.machine()
	go func() {
		defer close(done)
		timer := time.NewTimer(UpdateCheckInitialDelay)
		defer timer.Stop()
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
		}
		ticker := time.NewTicker(UpdateCheckInterval)
		defer ticker.Stop()
		for {
			st := u.Status()
			if st.State != UpdateDownloading && st.State != UpdateChecking && st.State != UpdateInstalling && st.State != UpdateRestarting && st.State != UpdateReadyToRestart && st.State != UpdateDeferred {
				st, e := u.CheckForUpdates(ctx)
				if e == nil && st.State == UpdateAvailable && u.Store != nil {
					settings, se := u.Store.Settings()
					if se == nil && settings.AutoUpdateEnabled {
						st, e = u.DownloadCurrent(ctx)
					}
				}
				if e == nil && st.CanRestart && onReady != nil {
					onReady(st)
				}
			}
			select {
			case <-ctx.Done():
				u.CancelUpdate()
				return
			case <-ticker.C:
			case <-m.checkNow:
			}
		}
	}()
	return done
}
func readBoundedFile(name string, limit int64) ([]byte, error) {
	f, e := os.Open(name)
	if e != nil {
		return nil, e
	}
	defer f.Close()
	b, e := io.ReadAll(io.LimitReader(f, limit+1))
	if int64(len(b)) > limit {
		return nil, errors.New("file exceeds bound")
	}
	return b, e
}
func renameUpdateFile(from, to string) error {
	var last error
	for i := 0; i < 8; i++ {
		last = os.Rename(from, to)
		if last == nil {
			return nil
		}
		if !transientUpdateRename(last) {
			return last
		}
		time.Sleep(time.Duration(10*(i+1)) * time.Millisecond)
	}
	return last
}
func writeUpdateFile(name string, data []byte) error {
	f, e := os.CreateTemp(filepath.Dir(name), ".update-*")
	if e != nil {
		return e
	}
	tmp := f.Name()
	defer os.Remove(tmp)
	if e = f.Chmod(0600); e == nil {
		_, e = f.Write(data)
	}
	if e == nil {
		e = f.Sync()
	}
	ce := f.Close()
	if e == nil {
		e = ce
	}
	if e != nil {
		return e
	}
	return renameUpdateFile(tmp, name)
}
