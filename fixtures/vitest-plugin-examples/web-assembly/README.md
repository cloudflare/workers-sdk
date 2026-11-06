# ⚙️ web-assembly

This Worker makes use of a WebAssembly module to add two numbers together. Wrangler's default module rules are enabled by `@cloudflare/vitest-plugin` if you have `wrangler.configPath` or the `config` option configured. This means `.wasm` files can be imported as `WebAssembly.Module`s.

| Test                            | Overview                         |
| ------------------------------- | -------------------------------- |
| [add.test.ts](test/add.test.ts) | Integration test using `exports` |
