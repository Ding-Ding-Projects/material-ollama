import { useQuery } from "@tanstack/react-query"
import { getReleaseInfo } from "./api"
import type { ReleaseInfo } from "./types"

/**
 * The release metadata embedded into this exact running binary at build
 * time (see app/ui/buildinfo). It cannot change without a new build, so
 * there is nothing to poll -- `staleTime: Infinity` matches the same
 * reasoning useDocsInventory() documents for the (also build-time-fixed)
 * docs bundle.
 */
export function useReleaseInfo() {
  return useQuery<ReleaseInfo, Error>({
    queryKey: ["status", "release"],
    queryFn: getReleaseInfo,
    staleTime: Infinity,
  })
}
