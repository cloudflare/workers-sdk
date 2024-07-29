# import-wasm-static

`import-wasm-static` is a fixture that simply exports a `wasm` file via `package.json` exports to be used and imported in other fixtures, to test npm module resolution.

It also provides a `not-exported.wasm` file that is not exported via `package.json` exports, to test node module resolution.
