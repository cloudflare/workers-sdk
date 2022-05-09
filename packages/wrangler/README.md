## ⛅️ wrangler

> This package is for wrangler v2.x, released first in May 2022. If you're looking for v1.x of the `@cloudflare/wrangler` package, visit https://www.npmjs.com/package/@cloudflare/wrangler / https://github.com/cloudflare/wrangler.

`wrangler` is a command line tool for building [Cloudflare Workers](https://workers.cloudflare.com/).

## Quick Start

```bash
# Make a javascript file
echo "export default { fetch() { return new Response('hello world') } }" > index.js
# try it out
npx wrangler dev index.js
# and then publish it
npx wrangler publish index.js --name my-worker
# visit https://my-worker.<your workers subdomain>.workers.dev
```

## Create a Project

```bash
# Generate a new project
npx wrangler init my-worker
# try it out
cd my-worker && npm run start
# and then publish it
npm run publish
```

## Installation:

```bash
$ npm install wrangler --save-dev
```

## Commands

### `wrangler init [name]`

Creates a Worker project. For details on configuration keys and values, refer to the [documentation](https://developers.cloudflare.com/workers/cli-wrangler/configuration).

### `wrangler dev`

Start a local development server, with live reloading and devtools.

### `wrangler publish`

Publish the given script to the worldwide Cloudflare network.

For more commands and options, refer to the [documentation](https://developers.cloudflare.com/workers/cli-wrangler/commands).

## Pages

### `wrangler pages dev [directory] [-- command]`

Either serves a static build asset directory, or proxies itself in front of a command.

Builds and runs functions from a `./functions` directory or uses a `_worker.js` file inside the static build asset directory.

For more commands and options, refer to the [documentation](https://developers.cloudflare.com/pages/platform/functions#develop-and-preview-locally) or run `wrangler pages dev --help`.

## Documentation

For the latest Wrangler documentation, [click here](https://6b05b6e1.cloudflare-docs-7ou.pages.dev/workers/wrangler/).
