---
"wrangler": patch
---

Fix `wrangler dev` failing when configuration file contains trailing commas

Previously, `wrangler dev` would crash with a JSON parse error if `wrangler.json` contained trailing commas in arrays or objects. Since JSONC supports trailing commas, this is now handled correctly by using a JSONC-aware parser.
