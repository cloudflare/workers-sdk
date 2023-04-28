## Template: worker-openapi

[![Deploy with Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/workers-sdk/tree/main/templates/worker-openapi)

This template demonstrates using the [`itty-router-openapi`](https://github.com/cloudflare/itty-router-openapi) package to add openapi 3 schema generation and validation.

You can try this template in your browser [here](https://worker-openapi-example.radar.cloudflare.com/docs)!

## Setup

To create a `my-project` directory using this template, run:

```sh
$ npx wrangler generate my-project worker-openapi
# or
$ yarn wrangler generate my-project worker-openapi
# or
$ pnpm wrangler generate my-project worker-openapi
```

## Local development

Run `wrangler dev` and head to `/docs` our `/redocs` with your browser.

You'll be greeted with an OpenAPI page that you can use to test and call your endpoints.

## Deploy

Once you are ready, you can publish your code by running the following command:

```sh
$ wrangler deploy
```
