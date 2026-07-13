---
"miniflare": patch
"wrangler": patch
---

Add convenient logging for worker emails in the project directory. In addition to the system's temp directory, logs for emails sent by workers are also written to a local temp directory defined by the calling process, e.g for an simple text email sent via Wrangler this is `.wrangler/tmp/email/<session>/email-text/<message-uuid>.txt` (and related files) in the project root. Callers of Miniflare can control this location via the new `defaultProjectTmpPath` option, which Wrangler and Vite plugin now set automatically.
