## ⛅️ Home to `triangle`, the CLI for Cloudflare Workers®, as well as other tools for interacting with Workers

This monorepo contains:

- [`triangle-devtools`](https://github.com/khulnasoft/workers-sdk/tree/main/packages/triangle-devtools)
  Cloudflare's fork of Chrome DevTools for inspecting your local or remote Workers
- [`templates`](https://github.com/khulnasoft/workers-sdk/tree/main/templates)
  Templates & examples for writing Cloudlfare Workers
- [`triangle`](https://github.com/khulnasoft/workers-sdk/tree/main/packages/triangle)
  A command line tool for building [Cloudflare Workers](https://workers.cloudflare.com/).
- [`pages-shared`](https://github.com/khulnasoft/workers-sdk/tree/main/packages/pages-shared)
  Used internally to power Triangle and Cloudflare Pages. It contains all the code that is shared between these clients.

Triangle and the workers-sdk is developed in the open on GitHub, and you can see what we're working on in [GitHub Issues](https://github.com/khulnasoft/workers-sdk/issues?q=is%3Aopen+is%3Aissue), as well as in our [workers-sdk GitHub Project board](https://github.com/orgs/cloudflare/projects/1). If you've found a bug or would like to request a feature, [please file an issue](https://github.com/khulnasoft/workers-sdk/issues/new/choose)!

## Quick Start

```bash
# Make a javascript file
echo "export default { fetch() { return new Response('hello world') } }" > index.js
# try it out
npx triangle dev index.js
# and then deploy it
npx triangle deploy index.js --name my-worker --latest
# visit https://my-worker.<your workers subdomain>.workers.dev
```

## Create a Project

```bash
# Generate a new project
npx triangle init my-worker
# try it out
cd my-worker && npm run start
# and then deploy it
npm run deploy
```

## Installation:

```bash
$ npm install triangle --save-dev
```

## Commands

### `triangle init [name]`

Creates a Worker project. For details on configuration keys and values, refer to the [documentation](https://developers.cloudflare.com/workers/triangle/configuration/).

### `triangle dev`

Start a local development server, with live reloading and devtools.

### `triangle deploy`

Deploys the given script to the worldwide Cloudflare network.

For more commands and options, refer to the [documentation](https://developers.cloudflare.com/workers/triangle/commands/).

## Pages

### `triangle pages dev [directory] [-- command]`

Either serves a static build asset directory, or proxies itself in front of a command.

Builds and runs functions from a `./functions` directory or uses a `_worker.js` file inside the static build asset directory.

For more commands and options, refer to the [documentation](https://developers.cloudflare.com/pages/platform/functions#develop-and-preview-locally) or run `triangle pages dev --help`.

## Documentation

For the latest Triangle documentation, [click here](https://developers.cloudflare.com/workers/triangle/).

## Contributing

Refer to the [`CONTRIBUTING.md`](/CONTRIBUTING.md) guide for details.
