---
"miniflare": patch
---

fix: allow multiple workers with browser bindings in dev

You can now run multiple workers with multiple browser bindings in miniflare. Previously, this would crash with `kj/table.c++:49: failed: inserted row already exists in table`.
