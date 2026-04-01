---
"wrangler": patch
---

fix: use `formatConfigSnippet` for compatibility_date warning in `wrangler dev`

The compatibility_date warning shown when no date is configured in `wrangler dev` was hardcoded in TOML format. This now uses `formatConfigSnippet` to render the snippet in the correct format (TOML or JSON) based on the user's config file type.
