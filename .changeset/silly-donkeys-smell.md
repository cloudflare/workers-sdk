---
"wrangler": patch
---

Rebase absolute non-JavaScript module specifiers when `preserve_file_names` is enabled

With `preserve_file_names` set, a non-JS module imported by an absolute path kept that path as its module name. The build machine's filesystem layout ended up inside the deployed Worker, and the module was never written to `--outdir`. A local dry run reported success while the upload failed server-side with error code `10021`. Tooling that rewrites externals to absolute paths hits this, which is how it was found in `@opennextjs/cloudflare` with WASM imports.

Absolute specifiers are now rebased to `./<basename>`, which is what the hashed branch of the same code already does minus the hash prefix. Relative specifiers keep the behaviour they had.
