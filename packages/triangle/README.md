<h1 align="center"> ⛅️ wrangler </h1>
<section align="center" id="shieldio-badges">
<a href="https://www.npmjs.com/package/wrangler"><img alt="npm"  src="https://img.shields.io/npm/dw/wrangler?style=flat-square"></a>
<img alt="GitHub contributors" src="https://img.shields.io/github/contributors/cloudflare/workers-sdk?style=flat-square">
<img alt="GitHub commit activity (branch)" src="https://img.shields.io/github/commit-activity/w/cloudflare/workers-sdk/main?style=flat-square">
<a href="https://discord.gg/CloudflareDev"><img alt="Discord" src="https://img.shields.io/discord/595317990191398933?color=%23F48120&style=flat-square"></a>
</section>

`wrangler` is a command line tool for building [Cloudflare Workers](https://workers.cloudflare.com/).

## Quick Start

```bash
# Make a javascript file
echo "export default { fetch() { return new Response('hello world') } }" > index.js
# try it out
npx wrangler dev index.js
# and then deploy it
npx wrangler deploy index.js --name my-worker
# visit https://my-worker.<your workers subdomain>.workers.dev
```

## Create a Project

```bash
# Generate a new project
npx wrangler init my-worker --no-delegate-c3
# try it out
cd my-worker && npm run start
# and then deploy it
npm run deploy
```

## Installation:

```bash
$ npm install wrangler --save-dev
```

## Configuration:

Wrangler is configured via a `wrangler.toml` file in the project root. When utilizing the `wrangler init` command, a `wrangler.toml` file will be created for you.

Example:

```toml
name = "my-worker"
main = "./src/index.ts" # init w/ TypeScript
compatibility_date = "YYYY-MM-DD"
```

For more detailed information about configuration, refer to the [documentation](https://developers.cloudflare.com/workers/wrangler/configuration/).

## Commands

### `wrangler init [name]`

Creates a Worker project. For details on configuration keys and values, refer to the [documentation](https://developers.cloudflare.com/workers/wrangler/commands/#init).

### `wrangler dev`

Start a local development server, with live reloading and devtools.

### `wrangler deploy`

Publish the given script to the worldwide Cloudflare network.

For more commands and options, refer to the [documentation](https://developers.cloudflare.com/workers/wrangler/commands/).

## Pages

### `wrangler pages dev [directory] [-- command]`

Either serves a static build asset directory, or proxies itself in front of a command.

Builds and runs functions from a `./functions` directory or uses a `_worker.js` file inside the static build asset directory.

For more commands and options, refer to the [documentation](https://developers.cloudflare.com/pages/platform/functions#develop-and-preview-locally) or run `wrangler pages dev --help`.

## Documentation

For the latest Wrangler documentation, [click here](https://developers.cloudflare.com/workers/wrangler/).
