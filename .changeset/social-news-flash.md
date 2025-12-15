---
"wrangler": patch
---

Improve error message when `vars` in wrangler.toml contains TOML Date values

TOML parses unquoted date values like `DATE = 2024-01-01` as Date objects, which are not valid for environment variables. Previously this caused a confusing error from Miniflare. Now wrangler detects Date values early and provides a helpful error message suggesting to wrap the value in quotes:

```
The value for "vars.DATE" is a Date object.
TOML parses dates like `DATE = 2024-01-01` as Date objects.
To use a date string, wrap the value in quotes: `DATE = "2024-01-01"`.
```
