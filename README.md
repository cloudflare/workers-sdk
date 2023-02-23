## ⛅️ Home to `wrangler`, the CLI for Cloudflare Workers®, as well as other tools for interacting with Workers

This monorepo contains:

- [`wrangler-devtools`](https://github.com/cloudflare/workers-sdk/tree/main/packages/wrangler-devtools)
  Cloudflare's fork of Chrome DevTools for inspecting your local or remote Workers
- [`templates`](https://github.com/cloudflare/workers-sdk/tree/main/templates)
  Templates & examples for writing Cloudlfare Workers
- [`wrangler`](https://github.com/cloudflare/workers-sdk/tree/main/packages/wrangler)
  A command line tool for building [Cloudflare Workers](https://workers.cloudflare.com/).
- [`pages-shared`](https://github.com/cloudflare/workers-sdk/tree/main/packages/pages-shared)
  Used internally to power Wrangler and Cloudflare Pages. It contains all the code that is shared between these clients.

Wrangler is developed in the open on GitHub, and you can see what we're working on in [GitHub Issues](https://github.com/cloudflare/workers-sdk/issues?q=is%3Aopen+is%3Aissue). If you've found a bug or would like to request a feature, [please file an issue](https://github.com/cloudflare/workers-sdk/issues/new/choose)!

## Quick Start

```bash
# Make a javascript file
echo "export default { fetch() { return new Response('hello world') } }" > index.js
# try it out
npx wrangler dev index.js
# and then publish it
npx wrangler publish index.js --name my-worker --latest
# visit https://my-worker.<your workers subdomain>.workers.dev
```

## Create a Project

```bash
# Generate a new project
npx wrangler init my-worker
# try it out
cd my-worker && npm run start
# and then publish it
npm run deploy
```

## Installation:

```bash
$ npm install wrangler --save-dev
```

## Commands

### `wrangler init [name]`

Creates a Worker project. For details on configuration keys and values, refer to the [documentation](https://developers.cloudflare.com/workers/wrangler/configuration/).

### `wrangler dev`

Start a local development server, with live reloading and devtools.

### `wrangler publish`

Publish the given script to the worldwide Cloudflare network.

For more commands and options, refer to the [documentation](https://developers.cloudflare.com/workers/wrangler/commands/).

## Pages

### `wrangler pages dev [directory] [-- command]`

Either serves a static build asset directory, or proxies itself in front of a command.

Builds and runs functions from a `./functions` directory or uses a `_worker.js` file inside the static build asset directory.

For more commands and options, refer to the [documentation](https://developers.cloudflare.com/pages/platform/functions#develop-and-preview-locally) or run `wrangler pages dev --help`.

## Documentation

For the latest Wrangler documentation, [click here](https://developers.cloudflare.com/workers/wrangler/).

## Contributing

Refer to the [`CONTRIBUTING.md`](/CONTRIBUTING.md) guide for details.
