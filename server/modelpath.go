package server

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type ModelPath struct {
	ProtocolScheme string
	Registry       string
	Namespace      string
	Repository     string
	Tag            string
}

const (
	DefaultRegistry       = "ollama.com"
	DefaultNamespace      = "library"
	DefaultTag            = "latest"
	DefaultProtocolScheme = "https"
)

func ParseModelPath(name string) ModelPath {
	slashParts := strings.Split(name, "/")
	var registry, namespace, repository, tag string

	switch len(slashParts) {
	case 3:
		registry = slashParts[0]
		namespace = slashParts[1]
		repository = strings.Split(slashParts[2], ":")[0]
	case 2:
		registry = DefaultRegistry
		namespace = slashParts[0]
		repository = strings.Split(slashParts[1], ":")[0]
	case 1:
		registry = DefaultRegistry
		namespace = DefaultNamespace
		repository = strings.Split(slashParts[0], ":")[0]
	default:
		fmt.Println("Invalid image format.")
		return ModelPath{}
	}

	colonParts := strings.Split(name, ":")
	if len(colonParts) == 2 {
		tag = colonParts[1]
	} else {
		tag = DefaultTag
	}

	return ModelPath{
		ProtocolScheme: DefaultProtocolScheme,
		Registry:       registry,
		Namespace:      namespace,
		Repository:     repository,
		Tag:            tag,
	}
}

func (mp ModelPath) GetNamespaceRepository() string {
	return fmt.Sprintf("%s/%s", mp.Namespace, mp.Repository)
}

func (mp ModelPath) GetFullTagname() string {
	return fmt.Sprintf("%s/%s/%s:%s", mp.Registry, mp.Namespace, mp.Repository, mp.Tag)
}

func (mp ModelPath) GetShortTagname() string {
	if mp.Registry == DefaultRegistry && mp.Namespace == DefaultNamespace {
		return fmt.Sprintf("%s:%s", mp.Repository, mp.Tag)
	}
	return fmt.Sprintf("%s/%s:%s", mp.Namespace, mp.Repository, mp.Tag)
}

func (mp ModelPath) GetManifestPath(createDir bool) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}

	path := filepath.Join(home, ".ollama", "models", "manifests", mp.Registry, mp.Namespace, mp.Repository, mp.Tag)
	if createDir {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return "", err
		}
	}

	return path, nil
}

func GetBlobsPath(digest string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}

	path := filepath.Join(home, ".ollama", "models", "blobs")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", err
	}

	return filepath.Join(path, digest), nil
}

func migrateRegistryDomain() error {
	manifests, err := GetManifestPath()
	if err != nil {
		return err
	}

	targetDomain := filepath.Join(manifests, DefaultRegistry)
	if _, err := os.Stat(targetDomain); errors.Is(err, fs.ErrNotExist) {
		// noop
	} else if err != nil {
		return err
	} else {
		// target directory already exists so skip migration
		return nil
	}

	sourceDomain := filepath.Join(manifests, "registry.ollama.ai")

	//nolint:errcheck
	defer PruneDirectory(sourceDomain)

	return filepath.Walk(sourceDomain, func(source string, info fs.FileInfo, err error) error {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		} else if err != nil {
			return err
		}

		if !info.IsDir() {
			slog.Info("migrating registry domain", "path", source)

			rel, err := filepath.Rel(sourceDomain, source)
			if err != nil {
				return err
			}

			target := filepath.Join(targetDomain, rel)
			if _, err := os.Stat(target); errors.Is(err, fs.ErrNotExist) {
				// noop
			} else if err != nil {
				return err
			} else {
				return nil
			}

			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return err
			}

			if err := os.Rename(source, target); err != nil {
				return err
			}
		}

		return nil
	})
}
