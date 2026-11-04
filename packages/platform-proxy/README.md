# `@cloudflare/platform-proxy`

Emulates the bindings declared in a project's `cloudflare.config.ts` from Node.js, for code that runs outside the Workers runtime during local development, such as a framework's dev server.

```ts
import { getPlatformProxy } from "@cloudflare/platform-proxy";

const { env, cf, ctx, caches, dispose } = await getPlatformProxy();

await env.MY_KV.put("key", "value");

await dispose();
```

Binding data is persisted to `.cloudflare/state`, which the Cloudflare Vite plugin also uses.

Secrets are read from `.dev.vars` or `.env` files, as in the Cloudflare Vite plugin, and remote bindings connect to the real resources on your account unless `remoteBindings` is `false`. The `assets` binding isn't supported yet. Bindings to the Worker's own Durable Objects, Workflows or entrypoints are left out, because the proxy doesn't run the Worker's code.

## Attaching to a running runtime

Pass `url` to use a runtime that's already running instead, such as the one behind a Cloudflare Vite plugin dev server. It uses the bindings of the runtime's primary Worker, which behind the Vite plugin is your Worker. Nothing is read from `cloudflare.config.ts`:

```ts
const { env, cf, ctx, caches, dispose } = await getPlatformProxy({
	url: "http://localhost:5173",
});
```

When the runtime restarts, e.g. after a config change, the proxy connects again. `env`, `cf` and `caches` then reach the new runtime, so they can be kept. Anything taken from them before the restart, such as a binding or a Durable Object stub, can't be used anymore. `dispose()` only disconnects. To attach from another process, start both with the same `MINIFLARE_PLATFORM_PROXY_SECRET`, or pass the runtime's value as `secret`.

## Differences from Wrangler's `getPlatformProxy()`

- It reads `cloudflare.config.ts` from the current working directory, or from `configPath`. It doesn't search parent directories or read Wrangler configuration files.
- `mode` selects how `cloudflare.config.ts` is evaluated, in place of Wrangler's `environment`.
- `persist.path` has `v3` appended, matching the Cloudflare Vite plugin's layout.
- `envFiles` isn't supported: local values come from the `.dev.vars` or `.env` files for `mode`.
- `cf` defaults to `Record<string, unknown>` rather than `IncomingRequestCfProperties`, so `@cloudflare/workers-types` isn't required. Pass your own type as the second type argument.

This is not yet stable enough for external use — APIs may change without notice.
