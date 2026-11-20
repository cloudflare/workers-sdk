# Additional Modules

The modules directory contains the following example files:

- `bin-example.bin` - a TTF file for the Inter font with the extension changed to `.bin`
- `html-example.html` - a Hello World HTML document
- `text-example.txt` - a simple text file
- `wasm-example.wasm` - a compiled WebAssembly file that exports an `add` function
- `wasm-with-source-map.wasm` - `wasm-example.wasm` with a `sourceMappingURL` custom section naming `wasm-with-source-map.wasm.map`
- `other/wasm-with-source-map.wasm` - the same, plus an empty custom section so that its bytes differ, with a different `wasm-with-source-map.wasm.map`

The WebAssembly is generated from the following C code:

```c
#include <stdint.h>

int32_t add(int32_t a, int32_t b) {
    return a + b;
}
```
