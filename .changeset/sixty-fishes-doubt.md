---
"wrangler": patch
---

refactor: use xxhash-wasm for better compatibility with Windows

The previous xxhash package we were using required a build step, which relied upon tooling that was not always available on Window.

This version is a portable WASM package.
