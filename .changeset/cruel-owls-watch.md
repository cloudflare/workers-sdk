---
"miniflare": patch
---

fix incorrect bindings remote deduplication logic

when bindings are registered deduplication logic is applied to make sure that the same binding is not unnecessarily registered multiple times, the changes here fix the fact that such deduplication logic doesn't currently take into account whether bindings are used or not in remote mode (which is problematic when the same binding is used both in remote and local mode)
