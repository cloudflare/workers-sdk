---
"@cloudflare/workflows-shared": patch
"wrangler": patch
"miniflare": patch
---

Preserve NonRetryableError message and name when the `workflows_preserve_non_retryable_error_message` compatibility flag is enabled, instead of replacing it with a generic error message.
