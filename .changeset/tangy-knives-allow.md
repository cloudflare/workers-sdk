---
"wrangler": patch
---

Automatically convert TOML Date values in `vars` to strings

TOML parses unquoted date values like `DATE = 2024-01-01` as Date objects. Previously this caused a confusing error from Miniflare. Now wrangler automatically converts Date values to ISO date strings (YYYY-MM-DD format) and shows a warning:
