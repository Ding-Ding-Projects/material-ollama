# Candidate UPDATER-WIN-ENUM-001

Status: accepted after independent refutation evidence

## Trigger

Run the Windows-only focused test:

    go test ./app/updater -run '^TestIsInstallerRunning$' -count=1 -v

On the affected path, windows.EnumProcesses can return a non-zero byte count
in ret. The implementation uses that byte count as the element count when it
executes pids = pids[:ret], which can panic before the installer process scan
finishes.

## Affected surface

- Path: app/updater/updater_windows.go
- Symbols: IsProcRunning, isInstallerRunning
- User-visible consequence: the Windows updater's startup check can crash the
  updater process instead of returning whether an installer is running.

## Mechanism and causal evidence

1. EnumProcesses writes process IDs into a []uint32 and reports the number of
   bytes written through ret, not the number of uint32 elements.
2. ret is used directly as a slice bound for []uint32. A byte count of 8
   therefore means two process IDs but requests eight elements; a sufficiently
   populated result exceeds the 2048-element allocation and panics.
3. CloseHandle is deferred inside the process loop. Every successfully opened
   handle remains live until the whole scan returns, so a large process list can
   temporarily retain many process handles and make the crash/leak path more
   expensive.

## Impact

The updater may fail during startup process coordination, preventing normal
update handling. The deferred handle closes also create avoidable resource
pressure during enumeration. No Authenticode behavior is in scope for this
candidate.

## Confidence and assumptions

Confidence: high; independent refutation accepted.

Assumptions to verify independently:

- The golang.org/x/sys/windows version used by this checkout preserves the
  documented byte-count contract for EnumProcesses.
- The focused test reaches IsProcRunning on a real Windows host and the panic
  is not caused by an unrelated process-name or test-fixture issue.
- The handle lifetime is observable from the loop structure and can be repaired
  without changing matching behavior.

## Decisive regression

Add a Windows-focused regression that exercises the process enumeration seam
with a returned byte count and verifies that IsProcRunning does not use the
byte count as an element count. The regression must also keep the process scan's
matching behavior intact and ensure opened process handles are closed at the end
of each iteration.

- Expected red observation: the current implementation panics or leaves the
  per-iteration handle lifetime deferred until the full scan returns.
- Expected green observation: the repaired implementation completes without a
  slice-bounds panic, returns the expected matching PIDs, and closes each handle
  before the next iteration.

## Independent refutation vote

Vote: accept.

The requested read-only baby-pig route was not exposed in this nested session
(NODETERM_NODE_ID is unset and no collaboration tool is callable here). A
separate read-only Codex subprocess was attempted with gpt-5.6-luna, but its
robot-side shell launcher failed before inspection; it made no writes. The
independent evidence below is therefore recorded explicitly rather than being
represented as a completed baby-pig report:

- The pinned golang.org/x/sys@v0.37.0/windows/syscall_windows.go wrapper passes
  len(processIds) * 4 to the native API and names its output bytesReturned.
- The module's own TestEnumProcesses passes with a two-element uint32 array and
  asserts outSize == 8, directly confirming that the returned value is a byte
  count rather than an element count.
- The app's focused Windows regression reproduces the candidate independently:
  go test ./app/updater -run '^TestIsInstallerRunning$' -count=1 -v panics at
  updater_windows.go:384 with slice bounds out of range [:2676] with capacity
  2048.
- The loop's defer windows.CloseHandle(hProcess) is lexically inside the
  function but outside any helper closure, so Go defers each close until
  IsProcRunning returns, not at the end of the iteration. This is an
  independent resource-lifetime confirmation from the language semantics and
  the exact source structure.

No alternative cause explains both the module-level byte-count assertion and
the app-level ret == 2676 slice panic. The candidate is accepted for the
smallest repair: convert the byte count to a bounded element count and close
each process handle per iteration, without changing Authenticode behavior.

## Follow-up: the clamp alone was not the whole repair

The accepted fix clamped `processCount` to `len(pids)`, which stops the panic
and is correct as far as it goes. It is not sufficient on its own.

`EnumProcesses` never reports that it truncated. It fills the buffer and
returns exactly the buffer size, so a clamp turns a crash into a silently
short process list -- and `IsProcRunning` is asked "is the installer running?".
A truncated list answers "no" for a process that is running, on precisely the
busy machines whose process count overflowed the buffer in the first place.
That is a false negative in the worst available direction.

`IsProcRunning` now grows the buffer and retries until `EnumProcesses` returns
strictly fewer entries than the buffer holds, which is the only signal that
the whole list actually fit, with a bounded ceiling so a pathological host
cannot loop forever. The clamp is retained inside the loop as a second guard.
