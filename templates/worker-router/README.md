## Template: worker-router

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/worker-router)

This template demonstrates using the [`itty-router`](https://github.com/kwhitley/itty-router) package to add routing to your Cloudflare Workers.

[`index.js`](https://github.com/cloudflare/worker-template-router/blob/master/index.js) is the content of the Workers script.

## Setup

To create a `my-project` directory using this template, run:

```sh
$ npm init cloudflare my-project worker
# or
$ yarn create cloudflare my-project worker
# or
$ pnpm create cloudflare my-project worker
```

> **Note:** Each command invokes [`create-cloudflare`](https://www.npmjs.com/package/create-cloudflare) for project creation.

Before publishing your code you need to edit `wrangler.toml` file and add your Cloudflare `account_id` - more information about configuring and publishing your code can be found [in the documentation](https://developers.cloudflare.com/workers/learning/getting-started).

Once you are ready, you can publish your code by running the following command:

```sh
$ npm run deploy
# or
$ yarn run deploy
# or
$ pnpm run deploy
```
