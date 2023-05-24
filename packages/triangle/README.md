<h1 align="center"> ⛅️ triangle </h1>
<section align="center" id="shieldio-badges">
<a href="https://www.npmjs.com/package/triangle"><img alt="npm"  src="https://img.shields.io/npm/dw/triangle?style=flat-square"></a>
<img alt="GitHub contributors" src="https://img.shields.io/github/contributors/khulnasoft/workers-sdk?style=flat-square">
<img alt="GitHub commit activity (branch)" src="https://img.shields.io/github/commit-activity/w/khulnasoft/workers-sdk/main?style=flat-square">
<a href="https://discord.gg/CloudflareDev"><img alt="Discord" src="https://img.shields.io/discord/595317990191398933?color=%23F48120&style=flat-square"></a>
</section>

> This package is for triangle v2.x, released first in May 2022. If you're looking for v1.x of the `@khulnasoft/triangle` package, visit https://www.npmjs.com/package/@khulnasoft/triangle / https://github.com/khulnasoft/triangle-legacy.

`triangle` is a command line tool for building [Cloudflare Workers](https://workers.cloudflare.com/).

## Quick Start

```bash
# Make a javascript file
echo "export default { fetch() { return new Response('hello world') } }" > index.js
# try it out
npx triangle dev index.js
# and then deploy it
npx triangle deploy index.js --name my-worker
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

## Configuration:

Triangle is configured via a `triangle.toml` file in the project root. When utilizing the `triangle init` command, a `triangle.toml` file will be created for you.

example:

```toml
main = "./src/index.ts" # init w/ TypeScript
name = "my-worker"
compatibility_date = "YYY-MM-DD"
```

for more detailed information about configuration, see the [documentation](https://developers.cloudflare.com/workers/cli-triangle/configuration)

## Commands

### `triangle init [name]`

Creates a Worker project. For details on configuration keys and values, refer to the [documentation](https://developers.cloudflare.com/workers/triangle/commands/#init).

### `triangle dev`

Start a local development server, with live reloading and devtools.

### `triangle deploy`

Publish the given script to the worldwide Cloudflare network.

For more commands and options, refer to the [documentation](https://developers.cloudflare.com/workers/cli-triangle/commands).

## Pages

### `triangle pages dev [directory] [-- command]`

Either serves a static build asset directory, or proxies itself in front of a command.

Builds and runs functions from a `./functions` directory or uses a `_worker.js` file inside the static build asset directory.

For more commands and options, refer to the [documentation](https://developers.cloudflare.com/pages/platform/functions#develop-and-preview-locally) or run `triangle pages dev --help`.

## Documentation

For the latest Triangle documentation, [click here](https://developers.cloudflare.com/workers/triangle/).
