---
"wrangler": patch
---

fix: pass protocols from headers for wrangler dev

Prior to this change, the protocol passed between the client and the worker was being stripped out by wrangler.
