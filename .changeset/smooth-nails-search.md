---
"@cloudflare/vite-plugin": patch
---

Fix `Tunnel closed` being logged when no tunnel was opened

Previously, the Vite plugin printed `Tunnel closed` during cleanup even when tunnel startup had never begun. This message is now only shown after tunnel startup begins, including when the tunnel is still starting or has already expired.
