---
"miniflare": patch
---

Fix newline escaping edge-case for `wrangler d1 export --local`.

Previously, if you had a text field with both a real newline and a '\n' escaped newline, it would output both as real newlines.
