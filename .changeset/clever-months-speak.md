---
"miniflare": patch
---

In addition to the system's temp directory, logs for emails sent by workers will also be written to the directory: .wrangler/tmp/email/<worker-name>/<session-uuid>/email-text/<message-uuid> which is found in the project root.
