---
"@cloudflare/workers-auth": patch
---

Fix concurrent process race on single-use refresh tokens

Running several commands at the same time no longer risks invalidating your saved login, so you should no longer be unexpectedly asked to log in again. Refresh failures are now also surfaced as warnings for easier diagnosis.
