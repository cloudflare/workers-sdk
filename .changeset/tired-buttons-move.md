---
"wrangler": patch
---

fix: throw an error when `send_email` binding is configured with `remote: true`

Send Email bindings do not support accessing remote resources during local development. Wrangler will now throw an error if you try to configure a `send_email` binding with `remote: true`.
