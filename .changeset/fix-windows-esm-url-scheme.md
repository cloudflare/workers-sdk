---
"wrangler": patch
---

fix: resolve `ERR_UNSUPPORTED_ESM_URL_SCHEME` on Windows + Node 24

On Windows, the `rosie-skills` dependency passed a raw filesystem path (e.g. `C:\...\rosie.js`) to a dynamic `import()` call. Node's ESM loader rejects this because `C:` is interpreted as a URL scheme rather than a drive letter. The fix converts the path to a proper `file://` URL via `pathToFileURL()` before importing.

This is applied as a pnpm patch to `rosie-skills@0.6.3` until the fix is released upstream.
