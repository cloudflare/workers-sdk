---
"@cloudflare/workers-utils": patch
---

Surface error in diagnostics when TOML Date values are used in `vars`

TOML parses unquoted date values like `DATE = 2024-01-01` as Date objects. The config validation now surfaces an error in the diagnostics result when Date values are encountered, with a clear message telling you to quote the value as a string, e.g. `DATE = "2024-01-01"`.
