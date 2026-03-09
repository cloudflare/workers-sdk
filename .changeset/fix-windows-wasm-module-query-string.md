---
"wrangler": patch
---

fix: strip query strings from module filenames to fix ENOENT on Windows

When bundling modules with query string suffixes (e.g. `.wasm?module`), the `?` character was included in the output filename. Since `?` is not a valid filename character on Windows, this caused an ENOENT error during `wrangler dev`. This was particularly visible when using Prisma Client with D1 adapter, which imports `.wasm?module` files.

The fix strips query strings from module names before writing them to disk, while preserving correct module resolution.
