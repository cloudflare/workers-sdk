---
"@cloudflare/chrome-devtools-patches": patch
---

Update Chrome DevTools to Chrome 150 (M150)

Updates the Chrome DevTools frontend used by `wrangler dev` and the Cloudflare Vite plugin to the Chrome 150 (M150) release. The frontend's content security policy explicitly allows debugger connections to both `127.0.0.1` and `localhost`.
