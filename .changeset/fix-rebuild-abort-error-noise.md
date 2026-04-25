---
"wrangler": patch
---

Stop emitting a misleading `[wrangler:error] Docker build exited with code: <n>` log when the user aborts an in-progress container image build (for example by pressing the `r` rebuild hotkey while the previous build is still running).

The abort-detection branch in the local and multi-worker runtime controllers was matching the wrong error message — it checked for `"Build exited with code: 1"`, but the error thrown by the docker build helper is actually `"Docker build exited with code: <n>"`, and the exit code after a process-group SIGINT/SIGKILL is typically `130`/`137`/`143`, not `1`. As a result, every legitimate user-initiated rebuild abort produced a spurious error event and `[wrangler:error]` log line. The check now matches the real error message prefix and ignores any non-zero exit code from the aborted build, so a user-requested rebuild while another build is in progress is silent.
