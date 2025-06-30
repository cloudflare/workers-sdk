---
"@cloudflare/vitest-pool-workers": patch
---

fix: ensure that the `sourcemap-codec` library has been transformed correctly to be imported in workerd during Vitest runs

Prior to this the inline snapshot tests were failing because they use the `magic-string` library, which in turn relies upon the `sourcemap-codec` library.

This resulted in errors that look like:

```
Error running worker: SyntaxError: The requested module '@jridgewell/sourcemap-codec' does not provide an export named 'encode'
```
