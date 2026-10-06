---
"@cloudflare/vite-plugin": patch
---

Ship `using` and `await using` declarations to the runtime as written

Worker builds no longer lower explicit resource management into helper code, so Workers that use it ship about 1.7 KB less. workerd supports the syntax natively. On Vite 8 the plugin builds Workers at an `es2026` target, so Oxc leaves the syntax alone. On Vite 6 and 7, where esbuild has no `es2026` target, the Worker environments tell esbuild that `using` is supported instead. Client bundles keep their own targets and still lower it for browsers.
