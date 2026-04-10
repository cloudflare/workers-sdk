---
"wrangler": minor
---

Add `wrangler browser` commands for managing Browser Rendering sessions

New commands for Browser Rendering DevTools:

- `wrangler browser create [--lab] [--keepAlive <seconds>] [--open]` - Create a new session
- `wrangler browser close <sessionId>` - Close a session
- `wrangler browser list` - List active sessions
- `wrangler browser view [sessionId] [--target <selector>] [--open]` - View a live browser session

The `view` command auto-selects when only one session exists, or prompts for selection when multiple are available.

The `--open` flag controls whether to open DevTools in browser (default: true in interactive mode, false in CI/scripts). Use `--no-open` to just print the DevTools URL.

All commands support `--json` for programmatic output. Also adds `browser:write` OAuth scope to `wrangler login`.
