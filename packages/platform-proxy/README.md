# `@cloudflare/platform-proxy`

Emulates the bindings declared in a project's `cloudflare.config.ts` from Node.js, for code that runs outside the Workers runtime during local development, such as a framework's dev server.

```ts
import { getPlatformProxy } from "@cloudflare/platform-proxy";

const { env, cf, ctx, caches, dispose } = await getPlatformProxy();

await env.MY_KV.put("key", "value");

await dispose();
```

Binding data is persisted to `.cloudflare/state`, which the Cloudflare Vite plugin also uses.

Not supported yet: secrets, remote bindings, and the `assets` binding. Bindings to the Worker's own Durable Objects, Workflows or entrypoints are left out, because the proxy doesn't run the Worker's code.

## Differences from Wrangler's `getPlatformProxy()`

- It reads `cloudflare.config.ts` from the current working directory, or from `configPath`. It doesn't search parent directories or read Wrangler configuration files.
- `mode` selects how `cloudflare.config.ts` is evaluated, in place of Wrangler's `environment`.
- `persist.path` has `v3` appended, matching the Cloudflare Vite plugin's layout.
- `envFiles` and `remoteBindings` aren't supported.

This is not yet stable enough for external use — APIs may change without notice.
