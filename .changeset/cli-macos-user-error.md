---
"@cloudflare/cli": patch
---

Mark macOS version compatibility errors as user errors

When checking macOS version compatibility, the CLI now throws `UserError` instead of generic `Error`. This ensures that version incompatibility issues are properly classified as user-facing errors that shouldn't be reported to Sentry.
