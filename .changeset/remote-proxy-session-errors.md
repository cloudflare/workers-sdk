---
"wrangler": patch
---

Surface remote proxy session errors

When remote bindings fail to start, include the controller reason and root
cause in the error message to make failures like missing `cloudflared` clearer.
