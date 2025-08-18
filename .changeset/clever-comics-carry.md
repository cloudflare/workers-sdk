---
"wrangler": minor
---

feat: Add `wrangler prompt` - AI Assistant powered by opencode

Adds `wrangler prompt` command that launches [opencode](https://opencode.ai) AI assistant with Cloudflare Workers-specific system prompt and Cloudflare docs MCP server.

- `wrangler prompt` - Launch AI assistant with Cloudflare context
- `wrangler prompt "question"` - Launch with initial prompt
- `wrangler prompt --auth login/logout/list` - Manage authentication
- Auto-installs opencode if not present
- Pre-configures access to Cloudflare docs via MCP server
