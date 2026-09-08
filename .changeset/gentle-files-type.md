---
"wrangler": patch
---

Include default module rules in generated Worker types

`wrangler types` now declares the built-in Text, Data, and WebAssembly module patterns even when they are not repeated in the Wrangler configuration, keeping generated types aligned with deployment behavior.
