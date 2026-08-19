# Repository Root Build Script

## Behaviour

This is a repository build-tooling contract, not a screen inside the running desktop app -- there is no in-app surface for it to occupy. The real, working implementation is `build.bat` at the repository root: before delegating to `scripts/build_windows.ps1` for the actual Windows build, it runs `node scripts/check-uh-inventory.mjs --self-test` (the guard-of-guards) and then the plain structural check with no flags, refusing to build at all if either is red. In a very literal sense, this build script gates on the same evidence file this article describes.

## Configuration

TODO(repository-root-build-script): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(repository-root-build-script): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(repository-root-build-script): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(repository-root-build-script): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(repository-root-build-script): link the related features, the prerequisites, and the natural next article a reader should open.
