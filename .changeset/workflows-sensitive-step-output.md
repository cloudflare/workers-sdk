---
"wrangler": minor
"miniflare": minor
---

Add support for redacting sensitive Workflows step output in local dev.

Steps configured with `sensitive: "output"` now have their output redacted to `[REDACTED]` in step logs and step-output responses when running Workflows locally, matching production behavior. The real value is still passed to downstream steps, and step errors are never redacted.
