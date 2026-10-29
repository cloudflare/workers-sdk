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

## Programmatic configuration

The `config` option accepts a customizer with the signature
`(loadedConfig: ParsedInputConfigWithWorker) => ParsedInputConfigWithWorker`. It receives the parsed
`cloudflare.config.ts` configuration, or a default Worker configuration when no
file exists, and can customize account settings, Containers, and the entry Worker.
The loaded and returned configurations must include a Worker, even for assets-only projects.

Return a new configuration object, spreading any existing fields you want to
preserve. Nested objects and arrays are replaced rather than merged:

```ts
import { cloudflare } from "@cloudflare/vite-plugin";

cloudflare({
  config(loadedConfig) {
    return {
      ...loadedConfig,
      worker: {
        ...loadedConfig.worker,
        env: {
          ...loadedConfig.worker.env,
          FRAMEWORK_NAME: { type: "text", value: "my-framework" },
        },
      },
    };
  },
});
```

The customized configuration is recorded in the build output. Preview and
deployment from that output use the recorded configuration. Generated types
continue to describe `cloudflare.config.ts`.

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
