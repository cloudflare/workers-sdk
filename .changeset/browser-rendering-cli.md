---
"wrangler": minor
---

Add `wrangler browser` commands for managing Browser Rendering sessions

New commands for Browser Rendering DevTools:

- `wrangler browser create [--lab] [--keepAlive <seconds>]` - Create a new session and open DevTools
- `wrangler browser close <sessionId>` - Close a session
- `wrangler browser list` - List active sessions
- `wrangler browser open [sessionId] [--target <selector>]` - Open DevTools for a session

The `open` command auto-selects when only one session exists, or prompts for selection when multiple are available.

All commands support `--json` for programmatic output. Also adds `browser:write` OAuth scope to `wrangler login`.
