---
"wrangler": patch
---

polish: tweak static assets facade to log only real errors

This prevents the abundance of NotFoundErrors being unnecessaryily logged.
