---
"@cloudflare/vitest-plugin": minor
---

Automatically load `cloudflare.config.ts` in the Vitest plugin when it exists in the project root

Projects using the experimental TypeScript configuration format no longer need to pass `experimental.newConfig: true` to `cloudflareTest()`. An explicit `wrangler` option still selects the Wrangler configuration, and `experimental.newConfig: false` disables automatic detection. The Vite plugin continues to require its explicit `experimental.newConfig` option.
