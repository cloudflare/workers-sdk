# Template: worker-speedtest

[![Deploy with Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/workers-sdk/tree/main/templates/worker-speedtest)

Worker for measuring download / upload connection speed from the client side, using the [Performance Timing API](https://w3c.github.io/perf-timing-primer/).

[`index.ts`](https://github.com/cloudflare/workers-sdk/tree/main/templates/worker-speedtest/src/index.ts) is the content of the Workers script.
_Note:_ when running this as your own worker, your latency measurements may differ a small amount from the [official version](https://speed.cloudflare.com). This is due to the fact that we rely on an internal mechanism to determine the amount of server processing time, which is then subtracted from the measurement.

## Setup

To create a `my-project` directory using this template, run:

```sh
$ npx wrangler generate my-project worker-speedtest
# or
$ yarn wrangler generate my-project worker-speedtest
# or
$ pnpm wrangler generate my-project worker-speedtest
```

Before publishing your code you need to edit `wrangler.toml` file and add your Cloudflare `account_id` - more information about publishing your code can be found [in the documentation](https://developers.cloudflare.com/workers/learning/getting-started).

Once you are ready, you can publish your code by running the following command:

```sh
$ npm run deploy
# or
$ yarn run deploy
# or
$ pnpm run deploy
```
