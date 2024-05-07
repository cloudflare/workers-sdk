## Template: Worker-Router 

This template demonstrates how to use the [`itty-router`](https://github.com/kwhitley/itty-router) package to implement routing in a Cloudflare Workers project.

### Deploy with Workers

[![Deploy with Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/workers-sdk/tree/main/templates/worker-router)

### Prerequisites

Before you begin, ensure you have `wrangler` CLI installed. You can install it using npm:

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

Before deploying your project, you need to configure the `wrangler.toml` file with your Cloudflare account details. Replace the `account_id` field with your Cloudflare account ID. Detailed instructions on configuring your project can be found in the [official Cloudflare Workers documentation](https://developers.cloudflare.com/workers/learning/getting-started).

### Deployment

To deploy your worker to Cloudflare, use the following commands based on your package manager:

```sh
$ npm run deploy
# or
$ yarn run deploy
# or
$ pnpm run deploy
```

Ensure you have the right permissions and your `wrangler.toml` is properly configured before running the deploy command.

### More Information

For more information on working with Cloudflare Workers and `itty-router`, visit the [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/).
