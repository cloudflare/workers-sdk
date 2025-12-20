---
"wrangler": minor
---

Add command categories to `wrangler` help menu

The help output now groups commands by product category (Account, Compute & AI, Storage & Databases, Networking & Security) to match the Cloudflare dashboard organization:

` ` `
$ wrangler --help

COMMANDS
  wrangler docs [search..]  📚 Open Wrangler's command documentation in your browser

ACCOUNT
  wrangler auth    🔓 Manage authentication
  wrangler login   🔑 Login to Cloudflare
  ...

COMPUTE & AI
  wrangler ai          🤖 Manage AI models
  wrangler containers  📦 Manage Containers [open beta]
  ...
` ` `

This improves discoverability by organizing the 20+ wrangler commands into logical groups.
