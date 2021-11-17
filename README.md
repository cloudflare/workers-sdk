## 🤠 wrangler

`wrangler` is a command line tool for building [Cloudflare Workers](https://workers.cloudflare.com/).

[(Read the full stack week launch blog post.)](https://blog.cloudflare.com/wrangler-v2-beta/)

**DISCLAIMER**: This is a work in progress, and is NOT recommended for use in production. We are opening this preview for feedback from the community, and to openly share our [roadmap](https://github.com/cloudflare/wrangler2/issues/12) for the future. As such, expect APIs and documentation to change before the end of the preview.

Further, we will NOT do a general release until we are both feature complete, and have a full backward compatibility and incremental migration plan in place. For more details, follow the [parent roadmap issue](https://github.com/cloudflare/wrangler2/issues/12).

## Quick Start

```bash
# Make a javascript file
$ echo "export default { fetch() { return new Response('hello world') } }" > index.js
# try it out
$ npx wrangler@beta dev index.js
# and then publish it
$ npx wrangler@beta publish index.js --name my-worker
# visit https://my-worker.<your workers subdomain>.workers.dev
```

## Installation:

```bash
$ npm install wrangler@beta
```

## Commands

### `wrangler init [name]`

Creates a `wrangler.toml` configuration file. For more details on the configuration keys and values, refer to the [documentation](https://developers.cloudflare.com/workers/cli-wrangler/configuration).

### `wrangler dev [script]`

Start a local development server, with live reloading and devtools.

### `wrangler publish [script] --name [name]`

Publish the given script to the worldwide Cloudflare network.

For more commands and options, refer to the [documentation](https://developers.cloudflare.com/workers/cli-wrangler/commands).

### `wrangler pages dev [directory] [-- command]`

Either serves a static build asset directory, or proxies itself in front of a command.

Builds and runs functions from a `./functions` directory or uses a `_worker.js` file inside the static build asset directory.

For more commands and options, refer to the [documentation](https://developers.cloudflare.com/pages/platform/functions#develop-and-preview-locally) or run `wrangler pages dev --help`.
