---
"@cloudflare/workers-auth": patch
---

Fix concurrent process race on single-use refresh tokens

Running several commands at the same time no longer risks invalidating your saved login, so you should no longer be unexpectedly asked to log in again. Refresh failures are now also surfaced as warnings for easier diagnosis.

Concurrent commands preserve saved credentials during login, logout, and migration to encrypted storage. If another command is updating them, retry after it finishes. Interrupted writes leave the previous credentials intact, and later updates or logout remove abandoned temporary copies. Logout also removes saved credentials that have no usable refresh token.
