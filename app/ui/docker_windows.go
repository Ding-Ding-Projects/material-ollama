//go:build windows

package ui

import "os"

// init populates dockerCLICandidates (declared in docker.go) with the
// Windows Docker Desktop install layout. resolveDockerExecutable tries
// these absolute paths, in order, before falling back to a PATH lookup of
// "docker" -- see docker.go for why: Docker Desktop does not always put
// docker.exe on PATH, and we want the resolved absolute path to be exact
// (and shown to the user) rather than whatever the shell happens to find.
func init() {
	programFiles := os.Getenv("ProgramFiles")
	if programFiles == "" {
		programFiles = `C:\Program Files`
	}
	dockerCLICandidates = []string{
		programFiles + `\Docker\Docker\resources\bin\docker.exe`,
		programFiles + `\Docker\Docker\resources\cli-plugins\docker.exe`,
	}
}
