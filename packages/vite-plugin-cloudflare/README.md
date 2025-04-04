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

## Features

- Uses the Vite [Environment API](https://vite.dev/guide/api-environment) to integrate Vite with the Workers runtime
- Provides direct access to [Workers runtime APIs](https://developers.cloudflare.com/workers/runtime-apis/) and [bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/)
- Builds your front-end assets for deployment to Cloudflare, enabling you to build static sites, SPAs, and full-stack applications
- Official support for [React Router v7](https://reactrouter.com/) with server-side rendering
- Leverages Vite's hot module replacement for consistently fast updates
- Supports `vite preview` for previewing your build output in the Workers runtime prior to deployment

## Use cases

- React Router v7 (support for more full-stack frameworks is coming soon)
- Static sites, such as single-page applications, with or without an integrated backend API
- Standalone Workers
- Multi-Worker applications
