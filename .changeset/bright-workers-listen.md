---
"wrangler": patch
---

Detect named-only module Worker entrypoints correctly

Wrangler now distinguishes named-only module Workers from legacy Service Workers that happen to have named exports. A default export identifies a module Worker; otherwise, legacy `addEventListener` registration identifies Service Worker format.
