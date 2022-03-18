---
"wrangler": patch
---

polish: add a small banner for commands

This adds a small banner for most commands. Specifically, we avoid any commands that maybe used as a parse input (like json into jq). The banner itself simply says "⛅️ wrangler" with an orange underline.
