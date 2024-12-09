---
"wrangler": patch
---

fix: remove non-json output in json mode commands

Fixes regressions in 3.93.0 where unwanted text (wrangler banner, telemetry notice) was printing in commands that should only output valid json.
