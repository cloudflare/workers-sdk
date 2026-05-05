---
"wrangler": minor
---

Add support for named tunnels in `wrangler dev --tunnel=<name>`

You can now use an existing named Cloudflare Tunnel when starting a local dev session with `wrangler dev --tunnel=<name>`. This gives you a stable public hostname for local development instead of the temporary `trycloudflare.com` URL used by Quick Tunnels.