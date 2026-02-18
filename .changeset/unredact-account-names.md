---
"wrangler": patch
---

Stop redacting account names in `wrangler whoami` output in non-interactive mode

`wrangler whoami` is explicitly invoked to retrieve account info, so account names
should always be visible. Redacting them in non-interactive/CI environments makes it
difficult for coding agents and automated tools to identify which account to use.
Email addresses remain redacted in non-interactive mode to protect PII.
