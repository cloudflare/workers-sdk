---
"wrangler": patch
---

fix: correctly detect `service-worker` format when using `typeof module`

Wrangler automatically detects whether your code is a `modules` or `service-worker` format Worker based on the presence of a `default` `export`. This check currently works by building your entrypoint with `esbuild` and looking at the output metafile.

Previously, we were passing `format: "esm"` to `esbuild` when performing this check, which enables _format conversion_. This may introduce `export default` into the built code, even if it wasn't there to start with, resulting in incorrect format detections.

This change removes `format: "esm"` which disables format conversion when bundling is disabled. See https://esbuild.github.io/api/#format for more details.
