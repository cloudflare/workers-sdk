---
"wrangler": patch
---

feat: support `[wasm_modules]` for service-worker format workers

This lands support for `[wasm_modules]` as defined by https://github.com/cloudflare/wrangler/pull/1677.

wasm modules can be defined in service-worker format with configuration in wrangler.toml as -

```
[wasm_modules]
MYWASM = "./path/to/my-wasm.wasm"
```

The module will then be available as the global `MYWASM` inside your code. Note that this ONLY makes sense in service-worker format workers (for now).

(In the future, we MAY enable wasm module imports in service-worker format (i.e. `import MYWASM from './path/to/my-wasm.wasm'`) and global imports inside modules format workers.)
