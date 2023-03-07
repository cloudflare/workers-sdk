---
"wrangler": patch
---

feat: Add `--outdir` as an option when running `wrangler pages functions build`.

This deprecates `--outfile` when building a Pages Plugin with `--plugin`.

When building functions normally, `--outdir` may be used to produce a human-inspectable format of the `_worker.bundle` that is produced.
