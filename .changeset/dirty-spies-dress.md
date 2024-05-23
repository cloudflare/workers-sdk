---
"wrangler": patch
---

fix: Remove WARP certificate injection. Instead, you should ensure that any custom certificates that are needed are included in `NODE_EXTRA_CA_CERTS`.
