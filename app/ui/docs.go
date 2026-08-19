//go:build windows || darwin

package ui

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"sync"
)

// Go's //go:embed cannot reach outside the directory that holds the source
// file declaring it, and docs/features/uh-completeness/articles/ (the
// hand-authored source of every feature article) lives four levels above
// this package. Every article is therefore staged into a flat, byte-for-byte
// copy at app/ui/articles/ -- see scripts/check-docs-bundle.mjs, which
// guards that staged copy against the inventory and its source -- and this
// file embeds THAT copy.
//
//go:embed articles
var docsArticlesFS embed.FS

// docsH1Pattern extracts a scaffold or hand-written article's title from its
// leading "# Title" line. scripts/new-feature-article.mjs guarantees this is
// always the inventory's exact `title` for that feature id, so the server
// never needs to embed or parse inventory.json itself.
var docsH1Pattern = regexp.MustCompile(`(?m)^#\s+(.+?)\s*$`)

// docsTodoPattern matches one generated scaffold marker line, e.g.
// "TODO(regex-builder): describe ...". See docsIsScaffoldOnly below.
var docsTodoPattern = regexp.MustCompile(`^TODO\(`)

// DocsArticle is one feature's offline documentation article, as served to
// the desktop app's docs browser (see
// app/ui/app/src/screens/docs/DocsScreen.tsx and friends).
type DocsArticle struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	// Written is false when the article is nothing but the generated
	// scaffold -- every non-heading line still starts with "TODO(" -- and
	// true the moment any section carries real hand-written prose, even if
	// other sections in the same file are still scaffolded. The frontend
	// renders "Article not yet written" instead of the scaffold body
	// exactly when this is false; see docsIsScaffoldOnly.
	Written bool `json:"written"`
	// Content is the raw markdown body. Omitted from the inventory listing
	// (each entry there sets it to "") to keep that response small; the
	// per-article endpoint always sets it.
	Content string `json:"content,omitempty"`
}

var (
	docsLoadOnce sync.Once
	docsByID     map[string]DocsArticle
	docsLoadErr  error
)

// loadDocsArticles parses the embedded staged bundle exactly once per
// process (embed.FS content is fixed at build time, so there is nothing to
// invalidate) into an id -> DocsArticle map.
func loadDocsArticles() (map[string]DocsArticle, error) {
	docsLoadOnce.Do(func() {
		entries, err := fs.ReadDir(docsArticlesFS, "articles")
		if err != nil {
			docsLoadErr = fmt.Errorf("failed to read staged docs articles: %w", err)
			return
		}

		byID := make(map[string]DocsArticle, len(entries))
		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
				continue
			}
			id := strings.TrimSuffix(entry.Name(), ".md")
			raw, err := fs.ReadFile(docsArticlesFS, "articles/"+entry.Name())
			if err != nil {
				docsLoadErr = fmt.Errorf("failed to read staged article %q: %w", entry.Name(), err)
				return
			}
			content := string(raw)
			byID[id] = DocsArticle{
				ID:      id,
				Title:   docsArticleTitle(content, id),
				Written: !docsIsScaffoldOnly(content),
				Content: content,
			}
		}
		docsByID = byID
	})
	return docsByID, docsLoadErr
}

// docsArticleTitle reads the article's H1. Falls back to the raw id only if
// a staged file somehow has no heading at all -- scripts/new-
// feature-article.mjs never produces that, but a hand-edit could break it,
// and this must never panic on a malformed file.
func docsArticleTitle(content, id string) string {
	if m := docsH1Pattern.FindStringSubmatch(content); len(m) == 2 {
		return strings.TrimSpace(m[1])
	}
	return id
}

// docsIsScaffoldOnly reports whether an article carries nothing but its
// generated scaffold: headings and single-line TODO(<id>) markers, with no
// hand-written prose anywhere in the file. It is deliberately strict --
// evaluated per NON-BLANK, NON-HEADING line -- so a file with real prose in
// one section (e.g. only "Behaviour" hand-written) and TODO markers
// remaining in every other section still reports Written: true. Rendering
// that partially-written article's raw markdown (remaining TODO lines
// included) is honest about what is and is not done yet; only a file that
// is scaffold end to end gets the "Article not yet written" treatment
// instead of its body -- see DocsScreen's article pane.
func docsIsScaffoldOnly(content string) bool {
	for _, line := range strings.Split(content, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		if strings.HasPrefix(trimmed, "#") {
			continue
		}
		if docsTodoPattern.MatchString(trimmed) {
			continue
		}
		return false
	}
	return true
}

// docsInventoryResponse is GET /api/v1/docs/inventory's response shape: the
// full 85-feature list (sans article bodies) the drawer groups and filters.
type docsInventoryResponse struct {
	Features []DocsArticle `json:"features"`
}

func (s *Server) docsInventory(w http.ResponseWriter, r *http.Request) error {
	articles, err := loadDocsArticles()
	if err != nil {
		return err
	}

	list := make([]DocsArticle, 0, len(articles))
	for _, article := range articles {
		list = append(list, DocsArticle{ID: article.ID, Title: article.Title, Written: article.Written})
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Title < list[j].Title })

	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(docsInventoryResponse{Features: list})
}

func (s *Server) docsArticleByID(w http.ResponseWriter, r *http.Request) error {
	articles, err := loadDocsArticles()
	if err != nil {
		return err
	}

	id := r.PathValue("id")
	article, ok := articles[id]
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		return fmt.Errorf("docs article not found: %s", id)
	}

	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(article)
}
