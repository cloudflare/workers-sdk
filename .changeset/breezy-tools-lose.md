---
"@cloudflare/workers-playground": patch
---

The workers playground's VSCodeEditor's `postMessage` `targetOrigin` is updated from `'\*'` to the specific `quickEditHost`.

This prevents the workers-playground from accidentally posting to an incorrect iframe.
