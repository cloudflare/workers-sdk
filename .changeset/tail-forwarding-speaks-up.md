---
"miniflare": patch
---

Report failures to forward tail events between local dev sessions

When a Worker's tail consumer runs in a separate local dev session and that session becomes unreachable, the failure to deliver tail events was discarded silently. It is now reported as a warning.
