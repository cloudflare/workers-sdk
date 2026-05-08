---
"wrangler": patch
---

fix: automatically delete log files older than 30 days and add WRANGLER_LOG_DISK=false to disable disk logging

Wrangler previously accumulated log files in `~/.wrangler/logs/` indefinitely, causing some users to accumulate gigabytes of logs over time.

Log files older than 30 days are now automatically cleaned up on the first log write. Disk logging can be disabled entirely by setting `WRANGLER_LOG_DISK=false`.
