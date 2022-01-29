---
"wrangler": patch
---

feat: inline text-like files into the worker bundle

We were adding text-like modules (i.e. `.txt`, `.html` and `.pem` files) as separate modules in the Worker definition, but this only really 'works' with the ES module Worker format. This commit changes that to inline the text-like files into the Worker bundle directly.

We still have to do something similar with `.wasm` modules, but that requires a different fix, and we'll do so in a subsequent commit.
