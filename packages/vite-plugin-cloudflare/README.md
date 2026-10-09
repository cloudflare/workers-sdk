# `@cloudflare/vite-plugin`

The Cloudflare Vite plugin enables a full-featured integration between [Vite](https://vite.dev/) and the [Workers runtime](https://developers.cloudflare.com/workers/runtime-apis/).
Your Worker code runs inside [workerd](https://github.com/cloudflare/workerd), matching the production behavior as closely as possible and providing confidence as you develop and deploy your applications.

```ts
// vite.config.ts

import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [cloudflare()],
});
```

## Documentation

### Wrangler-compatible customizers (Vite v2)

Use `wranglerConfig` for framework customizers written for the Vite v1 Wrangler
configuration contract. Native customizers continue to use `config`; the two
options cannot be combined.

```ts
import { cloudflare } from "@cloudflare/vite-plugin";
import { flue, flueWorkerConfig } from "@flue/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [flue(), cloudflare({ wranglerConfig: flueWorkerConfig() })],
});
```

The compatibility view supports `main`, `compatibility_date`,
`compatibility_flags`, and `durable_objects.bindings`. Customizers can mutate the
view or return partial overrides. Cloudflare converts these changes back into
native configuration and validates them with its schemas; unsupported fields,
service environments, duplicate bindings, and binding collisions are rejected.

Keep Durable Object exports/storage and all other settings in
`cloudflare.config.ts`. The adapter does not translate migration histories or
load Wrangler configuration files. Preview serves built output without invoking
customizers, just as it does for native `config` callbacks.

Full documentation can be found [here](https://developers.cloudflare.com/workers/vite-plugin/).

## Features

- Uses the Vite [Environment API](https://vite.dev/guide/api-environment) to integrate Vite with the Workers runtime
- Provides direct access to [Workers runtime APIs](https://developers.cloudflare.com/workers/runtime-apis/) and [bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/)
- Builds your front-end assets for deployment to Cloudflare, enabling you to build static sites, SPAs, and full-stack applications
- Official support for [TanStack Start](https://tanstack.com/start/) and [React Router v8](https://reactrouter.com/) with server-side rendering
- Leverages Vite's hot module replacement for consistently fast updates
- Supports `vite preview` for previewing your build output in the Workers runtime prior to deployment

## Use cases

- [TanStack Start](https://tanstack.com/start/)
- [React Router v8](https://reactrouter.com/)
- Support for more full-stack frameworks is coming soon
- Static sites, such as single-page applications, with or without an integrated backend API
- Standalone Workers
- Multi-Worker applications
