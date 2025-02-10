# `@cloudflare/vite-plugin`

[Intro](#intro) | [Quick start](#quick-start) | [Tutorial](#tutorial) | [API](#api) | [Cloudflare environments](#cloudflare-environments) | [Migrating from `wrangler dev`](#migrating-from-wrangler-dev)

## Intro

The Cloudflare Vite plugin enables a full-featured integration between Vite and the Workers runtime.
Your Worker code runs inside [workerd](https://github.com/cloudflare/workerd), matching the production behavior as closely as possible and providing confidence as you develop and deploy your applications.

### Features

- Provides direct access to Workers runtime APIs and bindings
- Supports Workers Assets, enabling you to build static sites, SPAs, and full-stack applications
- Leverages Vite's hot module replacement for consistently fast updates
- Supports `vite preview` for previewing your build output in the Workers runtime prior to deployment

## Quick start

### Start with a basic `package.json`

```json
{
  "name": "cloudflare-vite-quick-start",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

> [!NOTE]
> Ensure that you include `"type": "module"` in order to use ES modules by default.

### Install the dependencies

```sh
npm install vite @cloudflare/vite-plugin wrangler --save-dev
```

### Create your Vite config file and include the Cloudflare plugin

```ts
// vite.config.ts

import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [cloudflare()],
});
```

### Create your Worker config file

```toml
# wrangler.toml

name = "cloudflare-vite-quick-start"
compatibility_date = "2024-12-30"
main = "./src/index.ts"
```

### Create your Worker entry file

```ts
// src/index.ts

export default {
  fetch() {
    return new Response(`Running in ${navigator.userAgent}!`);
  },
};
```

You can now develop (`npm run dev`), build (`npm run build`), preview (`npm run preview`), and deploy (`npm exec wrangler deploy`) your application.

## Tutorial

In this tutorial, you will create a React SPA that can be deployed as a Worker with Workers Assets.
Then, you will add an API Worker that can be accessed from the front-end code.
You will develop, build, and preview the application using Vite before finally deploying to Cloudflare.

### Set up and configure the React SPA

#### Scaffold a Vite project

Start by creating a React TypeScript project with Vite.

```sh
npm create vite@latest cloudflare-vite-tutorial -- --template react-ts
```

Open the `cloudflare-vite-tutorial` directory in your editor of choice.

#### Add the Cloudflare dependencies

```sh
npm install @cloudflare/vite-plugin wrangler --save-dev
```

#### Add the plugin to your Vite config

```ts
// vite.config.ts

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare()],
});
```

#### Create your Worker config file

```toml
# wrangler.toml

name = "cloudflare-vite-tutorial"
compatibility_date = "2024-12-30"
assets = { not_found_handling = "single-page-application" }
```

The [`not_found_handling`](https://developers.cloudflare.com/workers/static-assets/routing/#not_found_handling--404-page--single-page-application--none) value has been set to `single-page-application`.
This means that all not found requests will serve the `index.html` file.
With the Cloudflare plugin, the `assets` routing configuration is used in place of Vite's default behavior.
This ensures that your application's routing works the same way while developing as it does when deployed to production.

Note that the [`directory`](https://developers.cloudflare.com/workers/static-assets/binding/#directory) field is not used when configuring assets with Vite.
The `directory` in the output configuration will automatically point to the client build output.

> [!NOTE]
> When using the Cloudflare Vite plugin, the Worker config (for example, `wrangler.toml`) that you provide is the input configuration file.
> A separate output `wrangler.json` file is created when you run `vite build`.
> This output file is a snapshot of your configuration at the time of the build and is modified to reference your build artifacts.
> It is the configuration that is used for preview and deployment.

#### Run the development server

Run `npm run dev` to verify that your application is working as expected.

For a purely front-end application, you could now build (`npm run build`), preview (`npm run preview`), and deploy (`npm exec wrangler deploy`) your application.
However, this tutorial will show you how to go a step further and add an API Worker.

### Add an API Worker

#### Configure TypeScript for your Worker code

```sh
npm install @cloudflare/workers-types --save-dev
```

```jsonc
// tsconfig.worker.json

{
  "extends": "./tsconfig.node.json",
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.worker.tsbuildinfo",
    "types": ["@cloudflare/workers-types/2023-07-01", "vite/client"],
  },
  "include": ["api"],
}
```

```jsonc
// tsconfig.json

{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.worker.json" },
  ],
}
```

#### Add to your Worker configuration

```toml
# wrangler.toml

name = "cloudflare-vite-tutorial"
compatibility_date = "2024-12-30"
assets = { not_found_handling = "single-page-application", binding = "ASSETS" }
main = "./api/index.ts"
```

The assets `binding` defined here will allow you to access the assets functionality from your Worker.

#### Add your API Worker

```ts
// api/index.ts

interface Env {
  ASSETS: Fetcher;
}

export default {
  fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return Response.json({
        name: "Cloudflare",
      });
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
```

The Worker above will be invoked for any request not matching a static asset.
It returns a JSON response if the `pathname` starts with `/api/` and otherwise passes the incoming request through to the assets binding.
This means that for paths that do not start with `/api/`, the `not_found_handling` behavior defined in the Worker config will be evaluated and the `index.html` file will be returned, enabling SPA navigations.

#### Call the API from the client

Edit `src/App.tsx` so that it includes an additional button that calls the API and sets some state.
Replace the file contents with the following code:

```tsx
// src/App.tsx

import { useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import "./App.css";

function App() {
  const [count, setCount] = useState(0);
  const [name, setName] = useState("unknown");

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <button
          onClick={() => setCount((count) => count + 1)}
          aria-label="increment"
        >
          count is {count}
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <div className="card">
        <button
          onClick={() => {
            fetch("/api/")
              .then((res) => res.json() as Promise<{ name: string }>)
              .then((data) => setName(data.name));
          }}
          aria-label="get name"
        >
          Name from API is: {name}
        </button>
        <p>
          Edit <code>api/index.ts</code> to change the name
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  );
}

export default App;
```

Now, if you click the button, it will display 'Name from API is: Cloudflare'.

Increment the counter to update the application state in the browser.
Next, edit `api/index.ts` by changing the `name` it returns to `'Cloudflare Workers'`.
If you click the button again, it will display the new `name` while preserving the previously set counter value.
With Vite and the Cloudflare plugin, you can iterate on the client and server parts of your app quickly without losing UI state between edits.

#### Build your application

Run `npm run build` to build your application.

If you inspect the `dist` directory, you will see that it contains two subdirectories: `client` and `cloudflare-vite-tutorial`.
The `cloudflare-vite-tutorial` directory contains your Worker code and the output `wrangler.json` configuration.

#### Preview your application

Run `npm run preview` to validate that your application runs as expected.
This command will run your build output locally in the Workers runtime, closely matching its behaviour in production.

#### Deploy to Cloudflare

Run `npm exec wrangler deploy` to deploy your application to Cloudflare.
This command will automatically use the output `wrangler.json` that was included in the build output.

### Next steps

In this tutorial, we created an SPA that could be deployed as a Worker with Workers Assets.
We then added an API Worker that could be accessed from the front-end code and deployed to Cloudflare.
Possible next steps include:

- Adding a binding to another Cloudflare service such as a [KV namespace](https://developers.cloudflare.com/kv/) or [D1 database](https://developers.cloudflare.com/d1/)
- Expanding the API to include additional routes
- Using a library, such as [tRPC](https://trpc.io/) or [Hono](https://hono.dev/), in your API Worker

## API

### `cloudflare`

The `cloudflare` plugin should be included in the Vite `plugins` array:

```ts
// vite.config.ts

import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [cloudflare()],
});
```

It accepts an optional `PluginConfig` parameter.

### `interface PluginConfig`

- `configPath?: string`

  An optional path to your Worker config file.
  By default, a `wrangler.toml`, `wrangler.json`, or `wrangler.jsonc` file in the root of your application will be used as the Worker config.

- `viteEnvironment?: { name?: string }`

  Optional Vite environment options.
  By default, the environment name is the Worker name with `-` characters replaced with `_`.
  Setting the name here will override this.

- `persistState?: boolean | { path: string }`

  An optional override for state persistence.
  By default, state is persisted to `.wrangler/state` in a `v3` subdirectory.
  A custom `path` can be provided or, alternatively, persistence can be disabled by setting the value to `false`.

- `auxiliaryWorkers?: Array<AuxiliaryWorkerConfig>`

  An optional array of auxiliary workers.
  You can use [service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/) to call auxiliary workers from your main (entry) Worker.
  All requests are routed through your entry Worker.
  During the build, each Worker is output to a separate subdirectory of `dist`.

> [!NOTE]
> When running `wrangler deploy`, only your main (entry) Worker will be deployed.
> If using multiple Workers, each must be deployed individually.
> You can inspect the `dist` directory and then run `wrangler deploy -c path-to-worker-output-config` for each.

### `interface AuxiliaryWorkerConfig`

- `configPath: string`

  A required path to your Worker config file.

- `viteEnvironment?: { name?: string }`

  Optional Vite environment options.
  By default, the environment name is the Worker name with `-` characters replaced with `_`.
  Setting the name here will override this.

## Cloudflare environments

A Worker config file may contain configuration for multiple [Cloudflare environments](https://developers.cloudflare.com/workers/wrangler/environments/).
With the Cloudflare Vite plugin, you select a Cloudflare environment at dev or build time by providing the `CLOUDFLARE_ENV` environment variable.
Consider the following example `wrangler.toml` file:

```toml
# wrangler.toml

name = "my-worker"
compatibility_date = "2024-12-30"
main = "./src/index.ts"

vars = { MY_VAR = "Top-level var" }

[env.staging]
vars = { MY_VAR = "Staging var" }

[env.production]
vars = { MY_VAR = "Production var" }
```

If you run `CLOUDFLARE_ENV=production vite build` then the output `wrangler.json` file generated by the build will be a flattened configuration for the 'production' Cloudflare environment.
This combines [top-level only](https://developers.cloudflare.com/workers/wrangler/configuration/#top-level-only-keys), [inheritable](https://developers.cloudflare.com/workers/wrangler/configuration/#inheritable-keys), and [non-inheritable](https://developers.cloudflare.com/workers/wrangler/configuration/#non-inheritable-keys) keys.
The value of `MY_VAR` will therefore be `'Production var'`.
The name of the Worker will be `'my-worker-production'`.
This is because the environment name is automatically appended to the top-level Worker name.

> [!NOTE]
> The default Vite environment name for a Worker is always the top-level Worker name.
> This enables you to reference the Worker consistently in your Vite config when using multiple Cloudflare environments.

Cloudflare environments can also be used in development.
For example, you could run `CLOUDFLARE_ENV=development vite dev`.
It is common to use the default top-level environment as the development environment and then add additional environments as necessary.

> [!NOTE]
> Running `vite dev` or `vite build` without providing `CLOUDFLARE_ENV` will use the default top-level Cloudflare environment.
> The value of `MY_VAR` will therefore be `'Top-level var'`.
> As Cloudflare environments are applied at dev and build time, specifying `CLOUDFLARE_ENV` when running `vite preview` or `wrangler deploy` will have no effect.

### Combining Cloudflare environments and Vite modes

You may wish to combine the concepts of [Cloudflare environments](https://developers.cloudflare.com/workers/wrangler/environments/) and [Vite modes](https://vite.dev/guide/env-and-mode.html#modes).
With this approach, the Vite mode can be used to select the Cloudflare environment and a single method can be used to determine environment specific configuration and code.
Consider again the previous example:

```toml
# wrangler.toml

name = "my-worker"
compatibility_date = "2024-12-30"
main = "./src/index.ts"

vars = { MY_VAR = "Top-level var" }

[env.staging]
vars = { MY_VAR = "Staging var" }

[env.production]
vars = { MY_VAR = "Production var" }
```

Next, provide `.env.staging` and `.env.production` files:

```sh
# .env.staging

CLOUDFLARE_ENV=staging
```

```sh
# .env.production

CLOUDFLARE_ENV=production
```

By default, `vite build` uses the 'production' Vite mode.
Vite will therefore load the `.env.production` file to get the environment variables that are used in the build.
Since the `.env.production` file contains `CLOUDFLARE_ENV=production`, the Cloudflare Vite plugin will select the 'production' Cloudflare environment.
The value of `MY_VAR` will therefore be `'Production var'`.
If you run `vite build --mode staging` then the 'staging' Vite mode will be used and the 'staging' Cloudflare environment will be selected.
The value of `MY_VAR` will therefore be `'Staging var'`.

## Secrets

Secrets can be provided to your Worker in local development using a [`.dev.vars`](https://developers.cloudflare.com/workers/configuration/secrets/#local-development-with-secrets) file. If you are using [Cloudflare Environments](#cloudflare-environments) then the relevant `.dev.vars` file will be selected. For example, `CLOUDFLARE_ENV=staging vite dev` will load `.dev.vars.staging` if it exists and fall back to `.dev.vars`.

> [!NOTE]
> The `vite build` command copies the relevant `.dev.vars[.env-name]` file to the output directory. This is only used when running `vite preview` and is not deployed with your Worker.

## Migrating from `wrangler dev`

Migrating from `wrangler dev` is a simple process and you can follow the instructions in the [Quick start](#quick-start) to get started.
There are a few key differences to highlight:

### Input and output Worker config files

In the Vite integration, your Worker config file (for example, `wrangler.toml`) is the input configuration and a separate output configuration is created as part of the build.
This output file is a snapshot of your configuration at the time of the build and is modified to reference your build artifacts.
It is the configuration that is used for preview and deployment.

### Redundant fields in the Wrangler config file

There are various options in the Worker config file that are ignored when using Vite, as they are either no longer applicable or are replaced by Vite equivalents.
If these options are provided, then warnings will be printed to the console with suggestions for how to proceed.
Examples where the Vite configuration should be used instead include `alias` and `define`.
