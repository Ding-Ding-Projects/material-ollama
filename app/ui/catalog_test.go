//go:build windows || darwin

package ui

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

// stubRegistryTransport rewrites the scheme and host of every outgoing
// request to point at a local httptest.Server, leaving the path and query
// untouched. catalog.go hard-codes registry.ollama.ai (via
// model.DefaultName().BaseURL()/model.ParseName(...).BaseURL()) and
// ollama.com (via the catalogIndexURL/catalogTagsURLFormat constants) --
// neither is a parameter this test can inject -- so this is the one lever
// available to exercise runCatalogRefresh against a controlled fixture
// instead of the real network.
type stubRegistryTransport struct {
	target *url.URL
}

func (s stubRegistryTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	rewritten := req.Clone(req.Context())
	rewritten.URL.Scheme = s.target.Scheme
	rewritten.URL.Host = s.target.Host
	rewritten.Host = s.target.Host
	return http.DefaultTransport.RoundTrip(rewritten)
}

// TestRunCatalogRefresh_OneFailingTagPageYieldsPartialVerdict is the
// "stubbed registry returning 404" case this lane's brief calls out by
// name: one repository's tag page genuinely 404s (a real, registry-shaped
// not-found, not the "route unimplemented" shape isUnimplementedRouteBody
// exists to distinguish), and the completeness verdict this produces must
// be "partial" with the exact reason string runCatalogRefresh's failed>0
// branch produces -- never "complete", which would tell a caller the
// catalog is trustworthy when a fifth of it silently failed to fetch.
func TestRunCatalogRefresh_OneFailingTagPageYieldsPartialVerdict(t *testing.T) {
	mux := http.NewServeMux()

	// GET /v2/_catalog: unimplemented on the real registry.ollama.ai --
	// Go's own default-mux "404 page not found" body, which
	// isUnimplementedRouteBody recognizes as "route not there" rather
	// than a hard error, so runCatalogRefresh falls through to the HTML
	// index instead of reporting "unavailable".
	mux.HandleFunc("/v2/_catalog", func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	})

	// ollama.com/library HTML index: two repositories, in this order --
	// extractLibraryLinks preserves document order, so "alpha" becomes
	// names[0] (the tags/list API probe target) and "beta" becomes
	// names[1].
	mux.HandleFunc("/library", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><body>`+
			`<a href="/library/alpha">alpha</a>`+
			`<a href="/library/beta">beta</a>`+
			`</body></html>`)
	})

	// GET /v2/library/alpha/tags/list: the spec-defined tags/list route,
	// probed once against the first repository. Also unimplemented, so
	// every repository's tags come from the HTML fallback below.
	mux.HandleFunc("/v2/library/alpha/tags/list", func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	})

	// alpha's HTML tags page: succeeds, with one real tag link.
	mux.HandleFunc("/library/alpha/tags", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><body><a href="/library/alpha:latest">alpha:latest</a></body></html>`)
	})

	// beta's HTML tags page: a genuine 404 -- this repository's tag page
	// is really gone, the one failure this test exists to prove
	// propagates into an honest "partial" verdict.
	mux.HandleFunc("/library/beta/tags", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "not found", http.StatusNotFound)
	})

	server := httptest.NewServer(mux)
	defer server.Close()

	target, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("parse httptest server URL: %v", err)
	}
	client := &http.Client{Transport: stubRegistryTransport{target: target}}

	snapshot := runCatalogRefresh(context.Background(), client)

	if snapshot.Verdict == CatalogVerdictComplete {
		t.Fatalf("a repository whose tag page 404'd must never produce a %q verdict; got snapshot: %+v", CatalogVerdictComplete, snapshot)
	}
	if snapshot.Verdict != CatalogVerdictPartial {
		t.Fatalf("Verdict = %q, want %q (snapshot: %+v)", snapshot.Verdict, CatalogVerdictPartial, snapshot)
	}

	const wantReason = "1 of 2 repositories' tag pages failed to fetch; their entries carry tagsError and no variants"
	if snapshot.Reason != wantReason {
		t.Fatalf("Reason = %q, want %q", snapshot.Reason, wantReason)
	}

	if snapshot.FailureCount != 1 {
		t.Fatalf("FailureCount = %d, want 1", snapshot.FailureCount)
	}
	if snapshot.NamesEnumerated != 2 {
		t.Fatalf("NamesEnumerated = %d, want 2", snapshot.NamesEnumerated)
	}
	if len(snapshot.Models) != 2 {
		t.Fatalf("len(Models) = %d, want 2", len(snapshot.Models))
	}

	// The successful repository still carries its real variant -- a
	// partial verdict must not blank out the data that DID resolve.
	alpha := snapshot.Models[0]
	if alpha.Name != "alpha" || !alpha.TagsFetched || len(alpha.Variants) != 1 || alpha.Variants[0].FullName != "alpha:latest" {
		t.Fatalf("alpha model entry = %+v, want TagsFetched=true with one alpha:latest variant", alpha)
	}

	// The failing repository carries the error and no fabricated variants.
	beta := snapshot.Models[1]
	if beta.Name != "beta" || beta.TagsFetched || beta.TagsError == "" || len(beta.Variants) != 0 {
		t.Fatalf("beta model entry = %+v, want TagsFetched=false, a non-empty TagsError, and zero variants", beta)
	}
}
