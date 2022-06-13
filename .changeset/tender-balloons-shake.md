---
"wrangler": patch
---

use `@cloudflare/kv-asset-handler` for `--experimental-public`

We'd previously vendored in `@cloudflare/kv-asset-handler` and `mime` for `--experimental-public`. We've since updated `@cloudflare/kv-asset-handler` to support module workers correctly, and don't need the vendored versions anymore. This patch uses the lib as a dependency, and deletes the `vendor` folder.
