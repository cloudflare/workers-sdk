---
"wrangler": patch
---

Fix `wrangler` reporting exit code 0 when its child process is killed by a signal (e.g. OOM/SIGKILL)

Previously, if the underlying `wrangler` process was terminated by a signal rather than exiting normally, the CLI wrapper reported exit code 0, making CI pipelines and other automation believe the command succeeded. `wrangler` now reports a non-zero exit code and logs the signal in this case.
