# Template: worker-postgres

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/worker-postgres)

This repo contains example code and a PostgreSQL driver that can be used in any Workers project. If you are interested in using the driver _outside_ of this template, copy the `driver/postgres` module into your project's `node_modules` or directly alongside your source.

## Setup

To create a `my-project` directory using this template, run:

```sh
$ npm init cloudflare my-project worker-postgres --no-delegate-c3
# or
$ yarn create cloudflare my-project worker-postgres --no-delegate-c3
# or
$ pnpm create cloudflare my-project worker-postgres --no-delegate-c3
```

> **Note:** Each command invokes [`create-cloudflare`](https://www.npmjs.com/package/create-cloudflare) for project creation.

## Usage

Before you start, please refer to the **[official tutorial](https://developers.cloudflare.com/workers/tutorials/query-postgres-from-workers-using-database-connectors)**.

```ts
const client = new Client({
	user: '<DATABASE_USER>',
	database: '<DATABASE_NAME>',
	// hostname is the full URL to your pre-created Cloudflare Tunnel, see documentation here:
	// https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/create-tunnel
	hostname: env.TUNNEL_HOST || 'https://dev.example.com',
	password: env.DATABASE_PASSWORD, // use a secret to store passwords
	port: '<DATABASE_PORT>',
});

await client.connect();
```

**Please Note:**

- you must use this config object format vs. a database connection string
- the `hostname` property must be the URL to your Cloudflare Tunnel, _NOT_ your database host
  - your Tunnel will be configured to connect to your database host

## Running the Postgres Demo

`postgres/docker-compose.yml`

This docker-compose composition will get you up and running with a local instance of `postgresql`,
`pgbouncer` in front to provide connection pooling, and a copy of `cloudflared` to enable your
applications to securely connect, through a encrypted tunnel, without opening any ports up locally.

### Usage

> from within `scripts/postgres`, run:

1. **Create credentials file (first time only)**

```sh
docker run -v ~/.cloudflared:/etc/cloudflared cloudflare/cloudflared:2021.10.5 login
```

2. **Start a local dev stack (cloudflared/pgbouncer/postgres)**

```sh
TUNNEL_HOSTNAME=dev.example.com docker-compose up
```
