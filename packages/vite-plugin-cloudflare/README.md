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

## Local Explorer allowed hosts

Local Explorer trusts loopback hostnames, including `*.localhost`, and configured Worker route and upstream hostnames. It does not inherit Vite's `allowedHosts` by default.

To also trust Vite's resolved `server.allowedHosts` (or `preview.allowedHosts` during preview), set the experimental environment variable `X_LOCAL_EXPLORER_USE_VITE_ALLOWED_HOSTS=true`. It defaults to `false`.

```sh
X_LOCAL_EXPLORER_USE_VITE_ALLOWED_HOSTS=true pnpm exec vite
```

This extends the Host and Origin allowlist for all `/cdn-cgi/` endpoints, including Local Explorer APIs. Enable it only when every hostname in Vite's allowed list should have access to those APIs. Exact hostnames and suffix entries such as `.example.com` are supported, including tunnel hostnames added by the plugin. Setting Vite's `allowedHosts: true` keeps Miniflare's default allowlist, even with this opt-in enabled.

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
