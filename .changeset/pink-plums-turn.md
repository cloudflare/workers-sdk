---
"wrangler": patch
---

fix: display chained errors from the CF API

For example if you have an invalid CF_API_TOKEN and try running `wrangler whoami`
you now get the additional `6111` error information:

```
✘ [ERROR] A request to the Cloudflare API (/user) failed.

  Invalid request headers [code: 6003]
  - Invalid format for Authorization header [code: 6111]
```
