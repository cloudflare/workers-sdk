---
"wrangler": minor
---

Add named tunnel support and tunnel shortcuts to `wrangler dev`

You can now use `wrangler dev --tunnel --tunnel-name <name>` to start a dev session with an existing named Cloudflare Tunnel, or set `--tunnel-name` ahead of time and start it later by pressing `t` to start or close the tunnel. This gives you a stable public hostname for local development instead of the temporary `trycloudflare.com` URL used by Quick Tunnels.
