---
"wrangler": patch
---

Stop redacting `wrangler whoami` output in non-interactive mode

`wrangler whoami` is explicitly invoked to retrieve account info, so email and
account names should always be visible. Redacting them in non-interactive/CI
environments makes it difficult for coding agents and automated tools to identify
which account to use. Other error messages that may appear unexpectedly in CI logs
(e.g. multi-account selection errors) remain redacted.
