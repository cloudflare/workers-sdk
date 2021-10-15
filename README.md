## 🤠 wrangler

`wrangler` is a command line tool for building [Cloudflare Workers](https://workers.cloudflare.com/).

## Quick Start

```bash
# Make a javascript file
$ echo "export default { fetch() { return new Response('hello world') } }" > index.js
# try it out
$ npx wrangler dev index.js
# and then publish it
$ npx wrangler publish index.js --name my-worker
# visit https://my-worker.<username>.workers.dev
```

## Installation:

```bash
$ npm install wrangler
```

## Commands

### `wrangler init [name]`

Creates a `wrangler.toml` configuration file. For more details on the configuration keys and values, refer to the [documentation](https://developers.cloudflare.com/workers/cli-wrangler/configuration).

### `wrangler dev [script]`

Start a local development server, with live reloading and devtools.

### `wrangler publish [script] --name [name]`

Publish the given script to the worldwide Cloudflare network.

For more commands and options, refer to the [documentation](https://developers.cloudflare.com/workers/cli-wrangler/commands).
