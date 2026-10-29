# `@cloudflare/platform-proxy`

Emulates the bindings declared in a project's `cloudflare.config.ts` from Node.js, for code that runs outside the Workers runtime during local development, such as a framework's dev server.

```ts
import { getPlatformProxy } from "@cloudflare/platform-proxy";

const { env, cf, ctx, caches, dispose } = await getPlatformProxy();

await env.MY_KV.put("key", "value");

await dispose();
```

Binding data is persisted to `.cloudflare/state`, which the Cloudflare Vite plugin also uses.

Not supported yet: secrets, remote bindings, and the `assets` binding. Bindings to Durable Objects or Workflows that the Worker itself exports are left out, because the proxy doesn't run the Worker's code.

This is not yet stable enough for external use — APIs may change without notice.
