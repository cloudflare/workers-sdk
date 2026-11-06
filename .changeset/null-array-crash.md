---
"@cloudflare/containers-shared": patch
"wrangler": patch
---

Fix container configuration comparisons crashing on null array entries

Container configuration arrays containing `null` no longer cause a TypeError when Wrangler sorts configurations for comparison. Null entries are preserved in their original positions.
