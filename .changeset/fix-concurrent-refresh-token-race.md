---
"@cloudflare/workers-auth": patch
---

Fix concurrent process race on single-use refresh tokens

Running several commands at the same time no longer risks invalidating your saved login, so you should no longer be unexpectedly asked to log in again. Refresh failures are now also surfaced as warnings for easier diagnosis.

Refresh, login, logout, and encrypted-storage migration coordinate through the same profile-level lock. Commands fail safely if another process holds the lock too long, and credential files are replaced atomically so interrupted writes do not leave partial credentials.
