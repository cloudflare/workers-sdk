---
"wrangler": patch
"@cloudflare/workers-utils": patch
---

Fix unresolved imports in Wrangler's published TypeScript declarations

Projects that check dependency declarations no longer need Wrangler's private build dependencies to resolve its public types. Inherited bindings remain compatible between Wrangler and the shared utilities used by the Vite and Vitest plugins.
