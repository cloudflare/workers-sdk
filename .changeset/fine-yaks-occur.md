---
"wrangler": minor
"@cloudflare/cli": minor
---

Add OSC 9;4 terminal progress indicator support

Adds support for OSC 9;4 escape sequences that display progress indicators in supported terminals (Windows Terminal, Ghostty, WezTerm, iTerm2 & ConEmu). When running operations like file uploads, the progress is now visible in:

- The terminal tab header as a progress ring/indicator
- The Windows taskbar (on Windows Terminal)

Progress indicators are now displayed during:

- KV bulk put/delete operations
- Pages asset uploads
- Workers asset uploads
- Workers Sites uploads

Set `WRANGLER_NO_OSC_PROGRESS=1` to disable this feature if needed.
