---
"@cloudflare/vitest-pool-workers": patch
---

fix: only apply module fallback extension probing for `require()`, not `import`

The module fallback service previously tried adding `.js`, `.mjs`, `.cjs`, and `.json` suffixes to extensionless specifiers unconditionally. Per the Node.js spec, this extension-probing behaviour is specific to CommonJS `require()`. ESM `import` statements must include explicit file extensions.

Extension-less TypeScript `import` specifiers continue to work correctly — they are resolved by Vite's resolver rather than the fallback's extension loop.
