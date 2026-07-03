---
"@cloudflare/local-explorer-ui": patch
---

Don't swallow unhandled keydown events (e.g. `Cmd/Ctrl+<number>` tab-switch shortcuts) when a data studio table cell is focused but not being edited
