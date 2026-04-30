---
"wrangler": patch
---

fix: automatically delete log files older than 7 days and add WRANGLER_LOG_DISK=false to disable disk logging

Wrangler previously accumulated log files in `~/.wrangler/logs/` indefinitely, causing some users to accumulate gigabytes of logs over time.

Log files older than 7 days are now automatically cleaned up at startup. The retention period can be changed by setting the `WRANGLER_LOG_MAX_AGE_DAYS` environment variable (e.g. `WRANGLER_LOG_MAX_AGE_DAYS=30` to keep 30 days of logs). Disk logging can be disabled entirely by setting `WRANGLER_LOG_DISK=false`.
