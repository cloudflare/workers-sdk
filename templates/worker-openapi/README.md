## Template: worker-openapi

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/worker-openapi)

This template demonstrates using the [`itty-router-openapi`](https://github.com/cloudflare/itty-router-openapi) package to add openapi 3 schema generation and validation.

You can try this template in your browser [here](https://worker-openapi-example.radar.cloudflare.com/docs)!

## Setup

To create a `my-project` directory using this template, run:

```sh
$ npm init cloudflare my-project worker-openapi --no-delegate-c3
# or
$ yarn create cloudflare my-project worker-openapi --no-delegate-c3
# or
$ pnpm create cloudflare my-project worker-openapi --no-delegate-c3
```

> **Note:** Each command invokes [`create-cloudflare`](https://www.npmjs.com/package/create-cloudflare) for project creation.

## Local development

Run `wrangler dev` and head to `/docs` our `/redocs` with your browser.

You'll be greeted with an OpenAPI page that you can use to test and call your endpoints.

## Deploy

Once you are ready, you can publish your code by running the following command:

```sh
$ wrangler deploy
```
