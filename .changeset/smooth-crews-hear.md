---
"wrangler": patch
"miniflare": patch
---

Reduce filesystem syscalls on deploy and dev hot paths

Several performance optimizations to reduce unnecessary filesystem operations:

- Switch `hashFile` from synchronous `readFileSync` to async `readFile`, enabling true parallelism in `Promise.all` loops
- Replace O(n*m) linear scan with O(1) `Map` lookup when matching asset hashes to manifest entries
- Read files within each upload bucket in parallel instead of sequentially
- Use `readdir({ withFileTypes: true })` to skip redundant `stat()` calls when walking asset directories
- Skip `node_modules` and `.git` directories in `getFiles()` for additional module discovery
- Precompile glob-to-regexp patterns once before iterating files instead of recompiling per file
- Stream KV bulk upload request bodies instead of buffering entire buckets in memory
