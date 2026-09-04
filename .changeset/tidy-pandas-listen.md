---
"@cloudflare/vitest-plugin": patch
---

Fix module fallback rewriting of `import.meta.url` inside dependency source text

Only executable `import.meta.url` expressions are now rewritten, preserving occurrences in strings, comments, and template literal text. This prevents dependency diagnostics containing `import.meta.url` from becoming invalid JavaScript during Worker test startup.
