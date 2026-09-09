---
"wrangler": patch
---

Include default module rules in generated Worker types

`wrangler types` now declares the built-in Text, Data, and WebAssembly module patterns even when they are not repeated in the Wrangler configuration, keeping generated types aligned with deployment behavior.

Service-worker declaration files are emitted as global scripts so that the generated wildcard module types are visible to imports.

Directory-specific rules retain their scope when TypeScript can represent it; ambiguous relative imports use a union of the possible deployed module types.
