---
"@cloudflare/vite-plugin": patch
---

Ship `using` and `await using` declarations to the runtime as written on Vite 8

On Vite 8, the plugin now builds Workers at an `es2026` target, which workerd supports natively. Oxc no longer lowers explicit resource management into `_usingCtx` helper code, so Workers that use it ship about 1.7 KB less. Vite 6 and 7 stay on `es2024`, because esbuild has no `es2026` target.
