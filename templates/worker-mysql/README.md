# Template: worker-mysql

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/worker-mysql)

This repo contains example code and a MySQL driver that can be used in any Workers project. If you are interested in using the driver _outside_ of this template, copy the `driver/mysql` module into your project's `node_modules` or directly alongside your source.

## Setup

To create a `my-project` directory using this template, run:

```sh
$ npx wrangler generate my-project worker-mysql
# or
$ yarn wrangler generate my-project worker-mysql
# or
$ pnpm wrangler generate my-project worker-mysql
```

## Usage

Before you start, please refer to the **[official tutorial](https://developers.cloudflare.com/workers/tutorials/query-postgres-from-workers-using-database-connectors)**.

```ts
const mysql = new Client();
const mysqlClient = await mysql.connect({
	username: '<DATABASE_USER>',
	db: '<DATABASE_NAME>',
	// hostname is the full URL to your pre-created Cloudflare Tunnel, see documentation here:
	// https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/create-tunnel
	hostname: env.TUNNEL_HOST || 'https://dev.example.com',
	password: env.DATABASE_PASSWORD, // use a secret to store passwords
});
```

**Please Note:**

- you must use this config object format vs. a database connection string
- the `hostname` property must be the URL to your Cloudflare Tunnel, _NOT_ your database host
  - your Tunnel will be configured to connect to your database host

## Running the MySQL Demo

`mysql/docker-compose.yml`

This docker-compose composition will get you up and running with a local instance of `mysql` and a
copy of `cloudflared` to enable your applications to securely connect through an encrypted tunnel.
Unlike the PostgreSQL example, this does not contain any server-side connection pool, but you can
configure one behind `cloudflared` should it be necessary.

### Usage

> from within `scripts/mysql`, run:

1. **Create credentials file (first time only)**

```sh
docker run -v ~/.cloudflared:/etc/cloudflared cloudflare/cloudflared:2021.10.5 login
```

2. **Start a local dev stack (cloudflared/mysql)**

```sh
TUNNEL_HOSTNAME=dev.example.com docker-compose up
```
