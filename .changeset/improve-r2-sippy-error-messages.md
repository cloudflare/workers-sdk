---
"wrangler": patch
---

Improve R2 Sippy error messages

Now error messages in `wrangler r2 bucket sippy` follow a consistent pattern: they describe what is missing, name the exact `--flag` to use, and provide context (e.g. example values, links to the dashboard). Previously, many errors said only "Error: must provide --flag." with no guidance on what the flag does or how to obtain the value.
