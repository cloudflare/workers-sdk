---
"wrangler": patch
---

Fix `wrangler whoami` and account selection failing for Account API Tokens

The `/memberships` fallback for Account API Tokens was checking for code 9109, but `/memberships` actually returns 9106 for that case. Correct the code so the fallback to `/accounts` triggers as intended.
