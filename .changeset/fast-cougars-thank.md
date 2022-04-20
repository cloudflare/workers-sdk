---
"wrangler": patch
---

feat: `publish --dry-run`

It can be useful to do a dry run of publishing. Developers want peace of mind that a project will compile before actually publishing to live servers. Combined with `--outdir`, this is also useful for testing the output of `publish`. Further, it gives developers a chance to upload our generated sourcemap to a service like sentry etc, so that errors from the worker can be mapped against actual source code, but before the service actually goes live.
