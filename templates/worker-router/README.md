## Template: Worker-Router 

This template demonstrates how to use the [`itty-router`](https://github.com/kwhitley/itty-router) package to implement routing in a Cloudflare Workers project.

### Deploy with Workers

[![Deploy with Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/workers-sdk/tree/main/templates/worker-router)

### Prerequisites

Before you begin, if you don't have `wrangler` installed, you can use `npx` which will install it temporarily when needed. If you prefer to install it permanently:

```sh
npm install -g @cloudflare/wrangler
```

### Setup

To create a new project directory using this template, run one of the following commands based on your package manager preference:

```sh
$ npx wrangler generate my-project worker-prospector
# or
$ yarn wrangler generate my-project worker-prospector
# or
$ pnpm wrangler generate my-project worker-prospector
```

### Configuration

With Wrangler v2+, configuration of the `account_id` is automated. Ensure that you are logged into your Cloudflare account through Wrangler by running:

```sh
wrangler login
```

This command will setup all necessary account details automatically.

### Deployment

To deploy your worker to Cloudflare, use the following commands based on your package manager:

```sh
$ npm run deploy
# or
$ yarn run deploy
# or
$ pnpm run deploy
```

Before deploying, make sure that your `wrangler.toml` is properly configured, which should be automatically handled by your login session.

### More Information

For more information on working with Cloudflare Workers and `itty-router`, visit the [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/).
```

