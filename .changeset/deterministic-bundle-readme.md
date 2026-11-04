---
"wrangler": patch
---

Honor SOURCE_DATE_EPOCH in bundled Worker READMEs

Use SOURCE_DATE_EPOCH, in Unix seconds, for the generated timestamp in --outdir READMEs, retaining the current-date default when it is unset. This lets reproducible build systems retain the build note without embedding wall-clock time.
