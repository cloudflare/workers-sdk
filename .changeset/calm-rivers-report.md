---
"@cloudflare/vite-plugin": patch
---

Surface Worker export type fetch errors during development

The Vite plugin now reports the Worker name, HTTP status, and response body when fetching export types fails. This preserves the underlying error instead of replacing it with a JSON parsing error.
