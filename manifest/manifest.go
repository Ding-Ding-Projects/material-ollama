package manifest

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"

	"github.com/ollama/ollama/types/model"
)

type Manifest struct {
	SchemaVersion int     `json:"schemaVersion"`
	MediaType     string  `json:"mediaType"`
	Config        Layer   `json:"config"`
	Layers        []Layer `json:"layers"`

	name     model.Name
	filepath string
	fi       os.FileInfo
	digest   string
}

func (m *Manifest) Size() (size int64) {
	for _, layer := range append(m.Layers, m.Config) {
		size += layer.Size
	}

	return
}

func (m *Manifest) Digest() string {
	return m.digest
}

func (m *Manifest) FileInfo() os.FileInfo {
	return m.fi
}

// ReadConfigJSON reads and unmarshals a config layer as JSON.
func (m *Manifest) ReadConfigJSON(configPath string, v any) error {
	for _, layer := range m.Layers {
		if layer.MediaType == "application/vnd.ollama.image.json" && layer.Name == configPath {
			blobPath, err := BlobsPath(layer.Digest)
			if err != nil {
				return err
			}
			data, err := os.ReadFile(blobPath)
			if err != nil {
				return err
			}
			return json.Unmarshal(data, v)
		}
	}
	return fmt.Errorf("config %q not found in manifest", configPath)
}

func (m *Manifest) Remove() error {
	if err := os.Remove(m.filepath); err != nil {
		return err
	}

	manifests, err := Path()
	if err != nil {
		return err
	}

	return pruneEmptyDirectory(manifests)
}

func (m *Manifest) RemoveLayers() error {
	ms, err := Manifests(true)
	if err != nil {
		return err
	}

	// Build set of digests still in use by other manifests
	inUse := make(map[string]struct{})
	for _, other := range ms {
		for _, layer := range append(other.Layers, other.Config) {
			if layer.Digest != "" {
				inUse[layer.Digest] = struct{}{}
			}
		}
	}

	// Remove layers not used by any other manifest
	for _, layer := range append(m.Layers, m.Config) {
		if layer.Digest == "" {
			continue
		}
		if _, used := inUse[layer.Digest]; used {
			continue
		}
		blob, err := BlobsPath(layer.Digest)
		if err != nil {
			return err
		}
		if err := os.Remove(blob); os.IsNotExist(err) {
			slog.Debug("layer does not exist", "digest", layer.Digest)
		} else if err != nil {
			return err
		}
	}

	return nil
}

func ParseNamedManifest(n model.Name) (*Manifest, error) {
	if !n.IsFullyQualified() {
		return nil, model.Unqualified(n)
	}

	manifests, err := Path()
	if err != nil {
		return nil, err
	}

	p := filepath.Join(manifests, n.Filepath())

	f, err := os.Open(p)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	fi, err := f.Stat()
	if err != nil {
		return nil, err
	}

	var m Manifest
	sha256sum := sha256.New()
	if err := json.NewDecoder(io.TeeReader(f, sha256sum)).Decode(&m); err != nil {
		return nil, err
	}

	m.name = n
	m.filepath = p
	m.fi = fi
	m.digest = hex.EncodeToString(sha256sum.Sum(nil))

	return &m, nil
}

func WriteManifest(name model.Name, config Layer, layers []Layer) error {
	manifests, err := Path()
	if err != nil {
		return err
	}

	p := filepath.Join(manifests, name.Filepath())
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}

	f, err := os.Create(p)
	if err != nil {
		return err
	}
	defer f.Close()

	m := Manifest{
		SchemaVersion: 2,
		MediaType:     "application/vnd.docker.distribution.manifest.v2+json",
		Config:        config,
		Layers:        layers,
		Ollama:        ollama,
	}

	return json.NewEncoder(f).Encode(m)
}

func Manifests(continueOnError bool) (map[model.Name]*Manifest, error) {
	manifests, err := Path()
	if err != nil {
		return nil, err
	}

	// TODO(mxyng): use something less brittle
	matches, err := filepath.Glob(filepath.Join(manifests, "*", "*", "*", "*"))
	if err != nil {
		return nil, err
	}

	ms := make(map[model.Name]*Manifest)
	for _, match := range matches {
		fi, err := os.Stat(match)
		if err != nil {
			return nil, err
		}

		if !fi.IsDir() {
			rel, err := filepath.Rel(manifests, match)
			if err != nil {
				if !continueOnError {
					return nil, fmt.Errorf("%s %w", match, err)
				}
				slog.Warn("bad filepath", "path", match, "error", err)
				continue
			}

			n := model.ParseNameFromFilepath(rel)
			if !n.IsValid() {
				if !continueOnError {
					return nil, fmt.Errorf("%s %w", rel, err)
				}
				slog.Warn("bad manifest name", "path", rel)
				continue
			}

			m, err := ParseNamedManifest(n)
			if err != nil {
				if !continueOnError {
					return nil, fmt.Errorf("%s %w", n, err)
				}
				slog.Warn("bad manifest", "name", n, "error", err)
				continue
			}

			ms[n] = m
		}
	}

	return ms, nil
}

func pruneEmptyDirectory(p string) error {
	fi, err := os.Lstat(p)
	if err != nil {
		return err
	}

	if fi.Mode()&os.ModeSymlink == 0 {
		entries, err := os.ReadDir(p)
		if err != nil {
			return err
		}

		for _, entry := range entries {
			if entry.IsDir() {
				if err := pruneEmptyDirectory(filepath.Join(p, entry.Name())); err != nil {
					return err
				}
			}
		}

		entries, err = os.ReadDir(p)
		if err != nil {
			return err
		}

		if len(entries) == 0 {
			if err := os.Remove(p); err != nil {
				return err
			}
		}
	}

	return nil
}
