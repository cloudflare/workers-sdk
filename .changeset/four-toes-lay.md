---
"wrangler": patch
---

fix: make `WRANGLER_LOG` case-insensitive, warn on unexpected values, and fallback to `log` if invalid

Previously, levels set via the `WRANGLER_LOG` environment-variable were case-sensitive.
If an unexpected level was set, Wrangler would fallback to `none`, hiding all logs.
The fallback has now been switched to `log`, and lenient case-insensitive matching is used when setting the level.
