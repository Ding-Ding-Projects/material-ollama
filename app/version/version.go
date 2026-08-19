//go:build windows || darwin

package version

var Version string = "0.0.0"

// Commit is the git commit SHA this binary was built from. It is set via
// -X ldflags in scripts/build_windows.ps1's buildApp, from $env:GITHUB_SHA
// in CI, rather than relied upon from debug.ReadBuildInfo -- VCS stamping
// there is not guaranteed to survive the -trimpath build. Empty for a
// local dev build.
var Commit string = ""
