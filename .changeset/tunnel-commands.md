---
"wrangler": minor
---

feat: add `wrangler tunnel` commands for managing Cloudflare Tunnels

Adds a new set of commands for managing Cloudflare Tunnels directly from Wrangler:

- `wrangler tunnel create <name>` - Create a new Cloudflare Tunnel
- `wrangler tunnel list` - List all tunnels in your account
- `wrangler tunnel info <tunnel>` - Display details about a specific tunnel
- `wrangler tunnel update <tunnel> --name <new-name>` - Rename a tunnel
- `wrangler tunnel delete <tunnel>` - Delete a tunnel (with confirmation)
- `wrangler tunnel run <tunnel>` - Run a tunnel using cloudflared
- `wrangler tunnel quick-start <url>` - Start a temporary tunnel (Try Cloudflare)

Additional tunnel tooling:

- `wrangler tunnel token <tunnel>` - Print the tunnel token (or write credentials JSON with `--cred-file`)
- `wrangler tunnel cleanup <tunnels...>` - Remove stale tunnel connections
- `wrangler tunnel service install <tunnel>` / `wrangler tunnel service uninstall` - Install/uninstall cloudflared as a system service
- `wrangler tunnel route dns <tunnel> <hostname>` - Create a DNS CNAME route to a tunnel
- `wrangler tunnel route ip add <network> <tunnel>` / `list` / `delete` / `get` - Manage private network routes for WARP

The `run` and `quick-start` commands automatically download and manage the cloudflared binary, caching it in `~/.wrangler/cloudflared/`. You can override the binary location with the `WRANGLER_CLOUDFLARED_PATH` environment variable.

These commands align with the `cloudflared tunnel` CLI naming conventions.
