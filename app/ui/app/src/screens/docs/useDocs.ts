import { useQuery } from "@tanstack/react-query"
import { getDocsArticle, getDocsInventory } from "@/api"
import type { DocsArticle, DocsFeature } from "@/api"

/**
 * The full 85-feature inventory (id/title/written, no article bodies) that
 * the drawer groups, searches, and renders written/scaffold status from.
 * The bundle is embedded at build time (see app/ui/docs.go), so once it has
 * loaded once this session there is nothing new to fetch -- `staleTime:
 * Infinity` reflects that rather than re-polling a server response that
 * cannot change without a new build.
 */
export function useDocsInventory() {
  return useQuery<DocsFeature[], Error>({
    queryKey: ["docs", "inventory"],
    queryFn: getDocsInventory,
    staleTime: Infinity,
  })
}

/** One article body, fetched only once a feature id is actually selected. */
export function useDocsArticle(id: string | null) {
  return useQuery<DocsArticle, Error>({
    queryKey: ["docs", "article", id],
    queryFn: () => getDocsArticle(id as string),
    enabled: id !== null,
    staleTime: Infinity,
  })
}
