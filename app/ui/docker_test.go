//go:build windows || darwin

package ui

import (
	"context"
	"fmt"
	"os"
	"testing"
)

// --- fake "docker" executable -------------------------------------------
//
// probeGPU (see docker.go) never assumes GPU capability from the presence
// of Docker or an NVIDIA driver: it runs "docker version", "docker info",
// "docker image inspect" and finally a real probe container, and derives
// its Verdict/Reason/NextStep entirely from what those commands report.
// Every one of those calls goes through exec.CommandContext(ctx, execPath,
// ...), so this test binary can stand in for the real "docker" CLI: when
// re-invoked with GO_WANT_FAKE_DOCKER=1 set, TestMain below hands control
// to fakeDockerMain() before the testing package's own flag parsing or
// m.Run() ever runs, so the argv probeGPU's helpers construct (e.g.
// "version --format {{json .}}") is read as a real docker subcommand
// rather than as test-binary flags. FAKE_DOCKER_SCENARIO selects which
// canned sequence of responses this process prints.
//
// This is the standard os/exec self-reinvocation pattern (see the Go
// standard library's own exec_test.go), adapted so probeGPU is exercised
// against real subprocess behavior -- real exit codes, real stdout/stderr
// capture through exec.Cmd.Output()/CombinedOutput() -- rather than a Go
// interface mock that could quietly drift from what a real docker CLI
// actually does.
func TestMain(m *testing.M) {
	if os.Getenv("GO_WANT_FAKE_DOCKER") == "1" {
		fakeDockerMain()
		return
	}
	os.Exit(m.Run())
}

// fakeDockerMain dispatches on the first argv token the same way the real
// docker CLI would (version / info / image / run), and answers according
// to FAKE_DOCKER_SCENARIO. It always terminates the process itself.
func fakeDockerMain() {
	scenario := os.Getenv("FAKE_DOCKER_SCENARIO")
	args := os.Args[1:]
	if len(args) == 0 {
		os.Exit(1)
	}

	switch args[0] {
	case "version":
		if scenario == "docker-missing" {
			fmt.Fprintln(os.Stderr, "docker: command not found")
			os.Exit(1)
		}
		fmt.Println(`{"Client":{"Version":"27.3.1"},"Server":{"Version":"27.3.1"}}`)
		os.Exit(0)

	case "info":
		switch scenario {
		case "non-wsl2-backend":
			// A real Windows-containers-mode "docker info" reports OSType
			// "windows" -- classifyDockerBackend must land on
			// "windows-containers", never "wsl2", from this alone.
			fmt.Println(`{"OSType":"windows","KernelVersion":"10.0.19045.4046","Runtimes":{}}`)
		case "image-not-present", "flag-rejected", "gpu-visible", "no-gpu-in-container":
			fmt.Println(`{"OSType":"linux","KernelVersion":"5.15.167.4-microsoft-standard-WSL2","Runtimes":{"nvidia":{}}}`)
		default:
			fmt.Println(`{"OSType":"linux","KernelVersion":"5.15.167.4-microsoft-standard-WSL2","Runtimes":{}}`)
		}
		os.Exit(0)

	case "image":
		// "docker image inspect <ref>" -- dockerImagePresentLocally only
		// looks at the exit code.
		if scenario == "image-not-present" {
			os.Exit(1)
		}
		os.Exit(0)

	case "run":
		switch scenario {
		case "flag-rejected":
			fmt.Println("docker: Error response from daemon: unknown flag: --gpus")
			os.Exit(1)
		case "gpu-visible":
			fmt.Print("/dev/dri:\ncard0  renderD128\n\n/proc/driver/nvidia:\ngpus  version\n")
			os.Exit(0)
		case "no-gpu-in-container":
			fmt.Print("ls: /dev/dri: No such file or directory\nls: /proc/driver/nvidia: No such file or directory\n")
			os.Exit(0)
		default:
			os.Exit(0)
		}

	default:
		os.Exit(1)
	}
}

// runProbeGPUScenario points a fresh dockerManager's probeGPU at this same
// test binary, re-invoked as the fake docker CLI under the given
// FAKE_DOCKER_SCENARIO. It cannot reuse exec.CommandContext directly the
// way probeGPU's helpers do internally -- instead it relies on those
// helpers calling exec.CommandContext(ctx, execPath, args...) with
// execPath set to this test binary's own path, which re-enters fakeDockerMain
// via TestMain because the environment carries GO_WANT_FAKE_DOCKER=1.
func runProbeGPUScenario(t *testing.T, scenario string) GPUCapability {
	t.Helper()
	t.Setenv("GO_WANT_FAKE_DOCKER", "1")
	t.Setenv("FAKE_DOCKER_SCENARIO", scenario)

	selfPath, err := os.Executable()
	if err != nil {
		t.Fatalf("os.Executable: %v", err)
	}

	m := &dockerManager{}
	return m.probeGPU(context.Background(), selfPath)
}

// TestProbeGPU_NonWSL2BackendYieldsCPUOnlyWithReason is the exact
// contract this lane's brief names: Docker GPU capability must return
// "cpu-only" together with an honest, specific reason -- never assumed --
// the moment the backend is anything other than WSL2, before any decisive
// probe container is even attempted.
func TestProbeGPU_NonWSL2BackendYieldsCPUOnlyWithReason(t *testing.T) {
	got := runProbeGPUScenario(t, "non-wsl2-backend")

	if !got.DockerPresent {
		t.Fatalf("DockerPresent = false, want true (docker version succeeded): %+v", got)
	}
	if got.Backend != "windows-containers" {
		t.Fatalf("Backend = %q, want %q", got.Backend, "windows-containers")
	}
	if got.Verdict != "cpu-only" {
		t.Fatalf("Verdict = %q, want %q (a non-WSL2 backend must never be assumed GPU-capable): %+v", got.Verdict, "cpu-only", got)
	}
	if got.Reason == "" {
		t.Fatal("Reason is empty; cpu-only must always carry the real reason it was decided")
	}
	if got.NextStep == "" {
		t.Fatal("NextStep is empty; a cpu-only verdict must always tell the user the concrete next action")
	}
	// The probe container must never have been reached: a non-WSL2
	// backend short-circuits before the decisive step.
	if got.ProbeResult != "not-run" {
		t.Fatalf("ProbeResult = %q, want %q -- probeGPU must never run the decisive container on a non-WSL2 backend", got.ProbeResult, "not-run")
	}
}

// TestProbeGPU_DockerMissingReportsAbsenceNotUnknown proves that when
// "docker version" itself fails, probeGPU reports DockerPresent=false with
// a real error-derived reason, rather than quietly falling through to a
// generic "unknown" verdict that would hide the actual cause.
func TestProbeGPU_DockerMissingReportsAbsenceNotUnknown(t *testing.T) {
	got := runProbeGPUScenario(t, "docker-missing")

	if got.DockerPresent {
		t.Fatal("DockerPresent = true, want false when docker version failed")
	}
	if got.Verdict != "unknown" {
		t.Fatalf("Verdict = %q, want %q", got.Verdict, "unknown")
	}
	if got.Reason == "" {
		t.Fatal("Reason is empty; a missing Docker install must still explain why")
	}
}

// TestProbeGPU_ImageNotPresentLocallyYieldsUnknownNeverAssumed proves
// probeGPU refuses to trigger an implicit multi-gigabyte image pull as a
// side effect of a capability check: on a genuine WSL2 backend with the
// probe image not yet pulled, the verdict is "unknown" (never "cpu-only"
// and never "gpu-available"), with a reason naming exactly why the
// decisive probe did not run.
func TestProbeGPU_ImageNotPresentLocallyYieldsUnknownNeverAssumed(t *testing.T) {
	got := runProbeGPUScenario(t, "image-not-present")

	if got.Backend != "wsl2" {
		t.Fatalf("Backend = %q, want %q", got.Backend, "wsl2")
	}
	if got.Verdict != "unknown" {
		t.Fatalf("Verdict = %q, want %q -- an unpulled probe image must never be silently assumed cpu-only or gpu-available", got.Verdict, "unknown")
	}
	if got.ProbeResult != "not-run" {
		t.Fatalf("ProbeResult = %q, want %q", got.ProbeResult, "not-run")
	}
}

// TestProbeGPU_FlagRejectedYieldsCPUOnlyWithToolkitReason proves that when
// Docker itself rejects "--gpus all" (the NVIDIA Container Toolkit is not
// registered), the verdict lands on cpu-only with ToolkitDetected
// explicitly "no" -- not "unknown" -- because Docker's own rejection is
// decisive, real evidence.
func TestProbeGPU_FlagRejectedYieldsCPUOnlyWithToolkitReason(t *testing.T) {
	got := runProbeGPUScenario(t, "flag-rejected")

	if got.ProbeResult != "flag-rejected" {
		t.Fatalf("ProbeResult = %q, want %q", got.ProbeResult, "flag-rejected")
	}
	if got.ToolkitDetected != TriStateNo {
		t.Fatalf("ToolkitDetected = %q, want %q", got.ToolkitDetected, TriStateNo)
	}
	if got.Verdict != "cpu-only" {
		t.Fatalf("Verdict = %q, want %q", got.Verdict, "cpu-only")
	}
}

// TestProbeGPU_NoDevicesVisibleYieldsCPUOnly proves that a probe container
// which runs successfully but sees no NVIDIA devices is reported cpu-only
// with ToolkitDetected "no" and zero DevicesSeen -- distinct from the
// flag-rejected and gpu-visible cases, exercising parseProbeDevices'
// "nothing matched" path against the container's real combined output.
func TestProbeGPU_NoDevicesVisibleYieldsCPUOnly(t *testing.T) {
	got := runProbeGPUScenario(t, "no-gpu-in-container")

	if got.ProbeResult != "no-gpu-in-container" {
		t.Fatalf("ProbeResult = %q, want %q", got.ProbeResult, "no-gpu-in-container")
	}
	if got.Verdict != "cpu-only" {
		t.Fatalf("Verdict = %q, want %q", got.Verdict, "cpu-only")
	}
	if len(got.DevicesSeen) != 0 {
		t.Fatalf("DevicesSeen = %v, want empty", got.DevicesSeen)
	}
}

// TestProbeGPU_DevicesVisibleYieldsGPUAvailable is the contrasting green
// case: a probe container that genuinely lists device paths under
// /dev/dri and /proc/driver/nvidia must produce Verdict "gpu-available"
// with DevicesSeen populated from the real (fake-CLI) output, proving
// probeGPU can reach the positive verdict and is not just permanently
// biased toward cpu-only/unknown.
func TestProbeGPU_DevicesVisibleYieldsGPUAvailable(t *testing.T) {
	got := runProbeGPUScenario(t, "gpu-visible")

	if got.ProbeResult != "gpu-visible" {
		t.Fatalf("ProbeResult = %q, want %q", got.ProbeResult, "gpu-visible")
	}
	if got.ToolkitDetected != TriStateYes {
		t.Fatalf("ToolkitDetected = %q, want %q", got.ToolkitDetected, TriStateYes)
	}
	if got.Verdict != "gpu-available" {
		t.Fatalf("Verdict = %q, want %q", got.Verdict, "gpu-available")
	}
	wantDevices := []string{"/dev/dri/card0", "/dev/dri/renderD128", "/proc/driver/nvidia/gpus", "/proc/driver/nvidia/version"}
	if len(got.DevicesSeen) != len(wantDevices) {
		t.Fatalf("DevicesSeen = %v, want %v", got.DevicesSeen, wantDevices)
	}
	for i, want := range wantDevices {
		if got.DevicesSeen[i] != want {
			t.Fatalf("DevicesSeen[%d] = %q, want %q (full: %v)", i, got.DevicesSeen[i], want, got.DevicesSeen)
		}
	}
}

// TestParseProbeDevices_IgnoresNotFoundLines proves parseProbeDevices (the
// pure parser behind every scenario above) treats "No such file or
// directory" / "cannot access" lines as absent directories rather than
// device entries, directly against the exact text a real `ls` on a
// GPU-less container emits.
func TestParseProbeDevices_IgnoresNotFoundLines(t *testing.T) {
	detail := "ls: cannot access '/dev/dri': No such file or directory\n" +
		"ls: cannot access '/proc/driver/nvidia': No such file or directory\n"
	got := parseProbeDevices(detail)
	if len(got) != 0 {
		t.Fatalf("parseProbeDevices(%q) = %v, want empty", detail, got)
	}
}

// TestClassifyDockerBackend_HyperVKernel proves the Hyper-V/LinuxKit
// branch of classifyDockerBackend (the legacy backend, distinct from
// WSL2) resolves correctly, so a mistaken "wsl2" classification can never
// slip a GPU probe past a backend that cannot pass a GPU through at all.
func TestClassifyDockerBackend_HyperVKernel(t *testing.T) {
	got := classifyDockerBackend("linux", "4.19.128-linuxkit")
	if got != "hyper-v" {
		t.Fatalf("classifyDockerBackend(linux, 4.19.128-linuxkit) = %q, want %q", got, "hyper-v")
	}
}
