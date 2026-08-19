# Dependency Bootstrap

## Behaviour

This is a repository/CI concern -- fetching the compiler toolchain a Windows build needs -- not something the running desktop app exposes to a user. The real implementation is `scripts/bootstrap_windows_tools.ps1` (358 lines), which reads `scripts/release-dependencies.json`'s pinned versions and digests, checks for an already-installed CMake/Ninja before downloading anything, and installs into a per-user toolchain root rather than requiring elevation. `.github/workflows/release.yaml` invokes it directly (line 122) on every release build.

## Configuration

TODO(dependency-bootstrap): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(dependency-bootstrap): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(dependency-bootstrap): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(dependency-bootstrap): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(dependency-bootstrap): link the related features, the prerequisites, and the natural next article a reader should open.
