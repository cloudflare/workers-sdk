---
"@cloudflare/unenv-preset": patch
"wrangler": patch
---

Simplify debug package resolution with nodejs_compat

A patched version of `debug` was previously introduced that resolved the package to a custom implementation. However, this caused issues due to CJS/ESM interop problems. We now resolve the `debug` package to use the Node.js implementation instead.
