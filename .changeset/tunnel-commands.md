---
"wrangler": minor
---

feat: add `wrangler tunnel` commands for managing Cloudflare Tunnels

Adds a new set of commands for managing remotely-managed Cloudflare Tunnels directly from Wrangler:

- `wrangler tunnel create <name>` - Create a new Cloudflare Tunnel
- `wrangler tunnel list` - List all tunnels in your account
- `wrangler tunnel info <tunnel>` - Display details about a specific tunnel
- `wrangler tunnel delete <tunnel>` - Delete a tunnel (with confirmation)
- `wrangler tunnel run <tunnel>` - Run a tunnel using cloudflared
- `wrangler tunnel quick-start <url>` - Start a temporary tunnel (Try Cloudflare)

The `run` and `quick-start` commands automatically download and manage the cloudflared binary, caching it in `~/.wrangler/cloudflared/`. Users are prompted before downloading and warned if their PATH-installed cloudflared is outdated. You can override the binary location with the `WRANGLER_CLOUDFLARED_PATH` environment variable.

All commands are marked as experimental.
