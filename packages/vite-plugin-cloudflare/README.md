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
configuration in memory and choose where the plugin writes generated files:

```ts
cloudflare({
  projectConfig: {
    worker: {
      name: "my-app",
      entrypoint: "./src/worker.ts",
      compatibilityDate: "2026-06-01",
    },
  },
  directory: ".framework/cloudflare",
});
```

`projectConfig` replaces file discovery, including `cloudflare.config.ts` and
Wrangler configuration checks. It accepts the same configuration as
`cloudflare.config.ts`, including account settings, Workers, and Containers, or
an async factory receiving `{ mode, isPreview }`. The existing `config` Worker
customizer still runs afterwards. File-based type generation is skipped; the
framework supplies its own types.

`directory` defaults to `.cloudflare`. It must be a subdirectory of the Vite
project root and can be relative or absolute. Build Output is written to
`<directory>/output`, generated types to `<directory>/types`, and local state
and temporary resources to `<directory>/state` and `<directory>/tmp`.
An explicit `persistState.path` continues to override the state location.
Changing `directory` does not move existing local state.

Use the same directory for development, build, and preview. Preview reads the
built configuration rather than evaluating `projectConfig`. Framework deployment
tooling can read the output using
`readBuildOutput(root, { outputDirectory: "<directory>/output" })` from
`@cloudflare/build-output-utils`; the versioned Build Output format is unchanged.
Tools that discover only the default `.cloudflare/output` location must be
adapted by the framework.

Both options are independent and opt-in. Without them, file discovery and output
locations retain their existing behavior.

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
