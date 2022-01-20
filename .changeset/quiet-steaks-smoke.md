---
"wrangler": patch
---

fix: align publishing sites asset keys with Wrangler 1

- Use the same hashing strategy for asset keys (xxhash64)
- Include the full path (from cwd) in the asset key
- Match include and exclude patterns against full path (from cwd)
- Validate that the asset key is not over 512 bytes long
