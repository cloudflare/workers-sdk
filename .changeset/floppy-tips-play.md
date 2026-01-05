---
"wrangler": patch
---

Surface a more helpful error message for TOML Date, Date-Time, and Time values in `vars`

TOML parses unquoted date/time values like `DATE = 2024-01-01` as objects. Previously this would cause an unhelpful error message further down the stack. Now wrangler surfaces a more helpful error message earlier, telling you to quote the value as a string, e.g. `DATE = "2024-01-01"`.
