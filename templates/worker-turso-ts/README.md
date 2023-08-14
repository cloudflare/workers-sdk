# Template: Cloudflare Worker using Turso and TypeScript

This is a complete project that uses [Turso], an edge-hosted distributed
database, and TypeScript to implement routes that read and write the database.
It is provided as part of a [tutorial], which walks you through the process of
setting up Turso and creating a database.

## Setup

To create a `my-project` directory using this template, run:

```sh
$ npx wrangler generate my-project worker-turso-ts
# or
$ yarn wrangler generate my-project worker-turso-ts
# or
$ pnpm wrangler generate my-project worker-turso-ts
```

In order to get this code to run, you will need to:

- Edit `wrangler.toml` and set the `LIBSQL_DB_URL` [environment variable]

- Create a new [Secret] to securely store the (sensitive) `LIBSQL_DB_AUTH_TOKEN`
  for your database. These values are created when you create your first Turso
  database as part of the [tutorial].

[turso]: https://turso.tech/
[tutorial]: https://developers.cloudflare.com/workers/tutorials/connect-to-turso-using-workers/
[environment variable]: https://developers.cloudflare.com/workers/platform/environment-variables/#add-environment-variables-via-wrangler
[secret]: https://developers.cloudflare.com/workers/platform/environment-variables/#add-secrets-to-your-project
