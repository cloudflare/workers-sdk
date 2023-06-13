# Template: worker-durable-objects

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/worker-durable-objects)

## Note: You must use [wrangler](https://developers.cloudflare.com/workers/cli-wrangler/install-update) 1.19.3 or newer to use this template.

## Please read the [Durable Object documentation](https://developers.cloudflare.com/workers/learning/using-durable-objects) before using this template.

A template for kick-starting a Cloudflare Workers project that uses Durable Objects.

## Setup

To create a `my-project` directory using this template, run:

```sh
$ npm init cloudflare my-project worker-durable-objects --no-delegate-c3
# or
$ yarn create cloudflare my-project worker-durable-objects --no-delegate-c3
# or
$ pnpm create cloudflare my-project worker-durable-objects --no-delegate-c3
```

> **Note:** Each command invokes [`create-cloudflare`](https://www.npmjs.com/package/create-cloudflare) for project creation.
