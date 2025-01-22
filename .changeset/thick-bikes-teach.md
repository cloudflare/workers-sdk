---
"wrangler": patch
---

refactor(wrangler): make JSON parsing independent of Node

Switch `jsonc-parser` to parse json:

- `JSON.parse()` exception messages are not stable across Node versions
- While `jsonc-parser` is used, JSONC specific syntax is disabled
