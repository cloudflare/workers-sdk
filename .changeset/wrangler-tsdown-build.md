---
"wrangler": patch
---

Fix TypeScript errors when importing Wrangler's APIs

Projects that import Wrangler's APIs, such as `getPlatformProxy` or `defineWranglerConfig`, can now type-check with `skipLibCheck: false`. The published types no longer refer to missing internal packages, and their required type dependencies are installed automatically.
