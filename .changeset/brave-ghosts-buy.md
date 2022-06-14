---
"wrangler": patch
---

fix: parsing of node inspector url

This fixes the parsing of the url returned by Node Inspector via stderr which could be received partially in multiple chunks or in a single chunk.

Closes #1226
