---
"@cloudflare/vitest-pool-workers": patch
---

Report unavailable Node imports and requires as module errors

Worker tests that import or require a Node built-in that is not available for their compatibility date and flags now fail with a clear module resolution error instead of crashing workerd through the module fallback redirect. Availability is computed for every compatibility-gated Node built-in (for example `node:punycode`, `node:cluster`, `node:sqlite`, `node:inspector`) from the same rules `@cloudflare/unenv-preset` uses, so this covers both the `import` and `require` paths.
