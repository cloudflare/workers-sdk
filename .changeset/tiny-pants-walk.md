---
"wrangler": patch
---

Add experimental support for wrangler dev/publish file.wasm

Allow wrangler to work with simple with WebAssembly programs that
operate on stdin/stdout by generating a js shim that uses
'@cloudflare/wasi'

Example:
cargo new hello_wasm
cd ./hello_wasm
cargo build --target wasm32-wasi --release
wrangler dev target/wasm32-wasi/release/hello_wasm.wasm
curl http://localhost:8787/
Hello, world!
