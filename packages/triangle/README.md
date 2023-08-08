<h1 align="center"> ⛅️ triangle </h1>
<section align="center" id="shieldio-badges">
<a href="https://www.npmjs.com/package/triangle"><img alt="npm"  src="https://img.shields.io/npm/dw/triangle?style=flat-square"></a>
<img alt="GitHub contributors" src="https://img.shields.io/github/contributors/khulnasoft/workers-sdk?style=flat-square">
<img alt="GitHub commit activity (branch)" src="https://img.shields.io/github/commit-activity/w/khulnasoft/workers-sdk/main?style=flat-square">
<a href="https://discord.gg/KhulnasoftDev"><img alt="Discord" src="https://img.shields.io/discord/595317990191398933?color=%23F48120&style=flat-square"></a>
</section>

`triangle` is a command line tool for building [Khulnasoft Workers](https://workers.cloudflare.com/).

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
npx triangle init my-worker --no-delegate-c3
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

Example:

```toml
name = "my-worker"
main = "./src/index.ts" # init w/ TypeScript
compatibility_date = "YYYY-MM-DD"
```

For more detailed information about configuration, refer to the [documentation](https://developers.cloudflare.com/workers/triangle/configuration/).

## Commands

### `triangle init [name]`

Creates a Worker project. For details on configuration keys and values, refer to the [documentation](https://developers.cloudflare.com/workers/triangle/commands/#init).

### `triangle dev`

Start a local development server, with live reloading and devtools.

### `triangle deploy`

Publish the given script to the worldwide Khulnasoft network.

For more commands and options, refer to the [documentation](https://developers.cloudflare.com/workers/triangle/commands/).

## Pages

### `triangle pages dev [directory] [-- command]`

Either serves a static build asset directory, or proxies itself in front of a command.

Builds and runs functions from a `./functions` directory or uses a `_worker.js` file inside the static build asset directory.

For more commands and options, refer to the [documentation](https://developers.cloudflare.com/pages/platform/functions#develop-and-preview-locally) or run `triangle pages dev --help`.

## Documentation

For the latest Triangle documentation, [click here](https://developers.cloudflare.com/workers/triangle/).
