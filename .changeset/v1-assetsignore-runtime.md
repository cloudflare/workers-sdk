---
"@cloudflare/vite-plugin": minor
---

Validate asset ignore files and update local Flagship support

Upgrade Miniflare to 5.20261023.2-beta and Wrangler to 4.155.0. Builds and asset manifest generation now reject `.assetsignore` files with invalid UTF-8 or null characters instead of silently ignoring their patterns. The Local Explorer also supports Flagship management by app ID, and local flag evaluations retain metadata.

Miniflare also waits for temporary file cleanup before disposal completes, so closing or restarting a Vite dev server finishes cleanup before returning.
