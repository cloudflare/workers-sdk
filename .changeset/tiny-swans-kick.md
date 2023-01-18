---
"wrangler": patch
---

fix: Copy module imports related files to outdir

When we bundle a Worker `esbuild` takes care of writing the
results to the output directory. However, if the Worker contains
any `external` imports, such as text/wasm/binary module imports,
that cannot be inlined into the same bundle file, `bundleWorker`
will not copy these files to the output directory. This doesn't
affect `wrangler publish` per se, because of how the Worker
upload FormData is created. It does however create some
inconsistencies when running `wrangler publish --outdir` or
`wrangler publish --outdir --dry-run`, in that, `outdir` will
not contain those external import files.

This commit addresses this issue by making sure the aforementioned
files do get copied over to `outdir` together with `esbuild`'s
resulting bundle files.
