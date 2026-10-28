---
"wrangler": patch
---

Render terminal control characters as visible text in tail output

Pretty tail and remote-preview output now escape control characters in log strings, exceptions and event metadata. Unicode, tabs and multiline logs remain readable, and JSON output keeps the original structured values.
