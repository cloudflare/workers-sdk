---
"wrangler": minor
"@cloudflare/vite-plugin": minor
---

Print a QR code alongside the tunnel URL when sharing via Cloudflare Tunnel

When a tunnel is started (via `wrangler dev --tunnel` or the Vite plugin with `tunnel: true`), a scannable QR code is now printed to the terminal beneath the tunnel URL. This makes it easy to open the tunnel on a mobile device without manually copying the URL.

The QR code uses Unicode block characters for a compact representation and is generated best-effort -- if generation fails for any reason, the tunnel URL is still displayed as before.
