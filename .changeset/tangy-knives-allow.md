---
"@cloudflare/workers-utils": patch
---

Surface error in diagnostics when TOML date/time values are used in `vars`

TOML parses unquoted date/time values like `DATE = 2024-01-01` as TOML Date, Date-Time, and Time values. The config validation now surfaces an error in the diagnostics result when this type of values are encountered, with a clear message telling you to quote the value as a string, e.g. `DATE = "2024-01-01"`.
