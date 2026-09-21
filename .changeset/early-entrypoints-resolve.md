---
"@cloudflare/config": minor
---

Convert module entrypoints to strings before parsing experimental Worker configuration

`resolveAndParseConfig()` now converts a `cf-worker` module namespace to its string specifier alongside other authored references. `InputWorkerSchema` consequently accepts only the string form.
