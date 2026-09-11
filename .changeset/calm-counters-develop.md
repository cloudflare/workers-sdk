---
"wrangler": patch
---

Allow `wrangler dev` to start module Workers without a default export

Wrangler now skips default-entrypoint middleware for Workers that only export named entrypoints. This avoids generating a middleware facade with an invalid default import.
