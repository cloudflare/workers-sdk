---
"wrangler": patch
---

fix: Only redact account names in CI environments, not all non-interactive contexts

The multi-account selection error in `getAccountId` now only redacts account names
when running in a CI environment (detected via `ci-info`). Non-interactive terminals
such as coding agents and piped commands can now see account names, which they need
to identify which account to configure. CI logs remain protected.
