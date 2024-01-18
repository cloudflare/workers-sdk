---
"wrangler": patch
---

fix: ensure dev server doesn't change request URLs

Previously, Wrangler's dev server could change incoming request URLs unexpectedly (e.g. rewriting `http://localhost:8787//test` to `http://localhost:8787/test`). This change ensures URLs are passed through without modification.

Fixes #4743.
