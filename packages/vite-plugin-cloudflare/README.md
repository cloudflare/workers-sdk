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

Full documentation can be found [here](https://developers.cloudflare.com/workers/vite-plugin/).

## Framework integration

Frameworks that own their configuration can supply the complete Cloudflare
configuration in memory:

```ts
cloudflare({
  projectConfig: {
    worker: {
      name: "my-app",
      entrypoint: "./src/worker.ts",
      compatibilityDate: "2026-06-01",
    },
  },
});
```

`projectConfig` replaces file discovery, including `cloudflare.config.ts` and
Wrangler configuration checks. It accepts the same configuration as
`cloudflare.config.ts`, including account settings, Workers, and Containers, or
an async factory receiving `{ mode, isPreview }`. The existing `config` Worker
customizer still runs afterwards. File-based type generation is skipped; the
framework supplies its own types. Preview reads the built configuration rather
than evaluating `projectConfig`.

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
