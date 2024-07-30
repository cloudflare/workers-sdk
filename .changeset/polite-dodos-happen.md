---
"miniflare": patch
---

fix: Allow the magic proxy to proxy objects containing functions indexed by symbols

In https://github.com/cloudflare/workers-sdk/pull/5670 we introduced the possibility
of the magic proxy to handle object containing functions, the implementation didn't
account for functions being indexed by symbols, address such issue
