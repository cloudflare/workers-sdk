---
"wrangler": patch
---

feat: unsafe-bindings

Adds support for "unsafe bindings", that is, bindings that aren't supported by wrangler, but are
desired when uploading a Worker to Cloudflare. This allows you to use beta features before
official support is added to wrangler, while also letting you migrate to proper support for the
feature when desired. Note: these bindings may not work everywhere, and may break at any time.
