---
"miniflare": patch
"wrangler": patch
---

Add convenient logging for worker emails in the project directory. In addition to the system's temp directory, logs for emails sent by workers will also be written to a ocal temp directory defined by the process. For wrangler this is: `.wrangler/tmp/email/<worker-name>/<session-uuid>/email-text/<message-uuid>` which is found in the project root. To locate the temporary path, the defaultProjectTmpPath option can be provided by service calling Miniflare. This has been added for Wrangler in this update.
