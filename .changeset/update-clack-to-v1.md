---
"wrangler": patch
"create-cloudflare": patch
"miniflare": patch
---

Update `@clack/core` and `@clack/prompts` to v1.2.0

Bumps the bundled `@clack/core` dependency used internally by `@cloudflare/cli` from `0.3.x` to `1.2.0`, and the unused `@clack/prompts` reference in `create-cloudflare` from `0.6.x` to `1.2.0`. Clack v1 is ESM-only and renames `TextPrompt#valueWithCursor` to `userInputWithCursor`; internal call sites have been updated accordingly. Validator return types have been widened to accept `Error` instances alongside strings, matching Clack's new API. No user-facing prompt behaviour changes are expected.
