# Template: worker-analytics-engine-forwarder

This is a template for a worker that receives JSON events via HTTPS and logs them into Workers Analytics Engine.

Messages should be POSTed to the worker as JSON objects. One JSON object per line.
Optionally, the payload can be gzipped and a `Content-Encoding: gzip` header set, otherwise it will assume the data is uncompressed.
Up to 25 events can be received at one time.

## Setup

To create a `my-project` directory using this template, run:

```sh
$ npm init cloudflare my-project worker-analytics-engine-forwarder --no-delegate-c3
# or
$ yarn create cloudflare my-project worker-analytics-engine-forwarder --no-delegate-c3
# or
$ pnpm create cloudflare my-project worker-analytics-engine-forwarder --no-delegate-c3
```

> **Note:** Each command invokes [`create-cloudflare`](https://www.npmjs.com/package/create-cloudflare) for project creation.

## Authentication

Authentication is via bearer token. You can use any token or password string as long as you supply the same string to both the worker and the caller. To configure the token on the worker side you must set the `BEARER_TOKEN` secret to the token value by running (in a terminal, from within this project directory):

```
npx wrangler secret put BEARER_TOKEN
```

then entering your token value.
Then, when calling the worker you must supply an `Authorization: Bearer <your token>` header, with `<your token>` replaced by the value supplied above.

## Customisation

Various customisations are suggested such as changing the worker and dataset names, and adjusting which fields are logged and any other pre-processing. See the comment at the top of `src/index.js` for where to make these changes.

## Further reading

See the [Cloudflare developer docs](https://developers.cloudflare.com/analytics/analytics-engine/) for more information on indexes, sampling and how to query the Workers Analytics Engine SQL API.
