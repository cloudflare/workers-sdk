# ⛏️ Prospector

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/worker-prospector)

An open-source template built for internal use by Cloudflare's SEO experts to parse and notify on new website content. Using D1, Queues, and Workers, this template will show you how to connect multiple Cloudflare products together to build a fully-featured application.

## Deployment

Clone the repository from the `cloudflare/tmemplates` repository:

```bash
$ npm init cloudflare my-project prospector --no-delegate-c3
# or
$ yarn create cloudflare my-project prospector --no-delegate-c3
# or
$ pnpm create cloudflare my-project prospector --no-delegate-c3
```

Install Wrangler if not already installed.

```bash
$ npm install @cloudflare/wrangler -g
```

Login to your account using Wrangler.

```
$ wrangler login

```

Create a new D1 database and Queues instance.

```bash
$ wrangler d1 create $DATABASE_NAME
$ wrangler queues create $QUEUE_NAME
```

Update `wrangler.toml` with the appropriate bindings. See [configuration](#configuration) for more information.

Run the `bin/migrate script` to create the tables in the database.

```bash
$ bin/migrate
```

Deploy the application to your account.

```bash
$ npm run deploy
```

Visit the Workers URL to access the user interface and add notifiers and URLs. Receive email when a new keyword match is found.

## Configuration

Prospector is configured with a combination of environment variables and secrets. The following configuration options are available (some are required):

- `AUTH_TOKEN` - An optional token to use for authentication when scraping websites. If not provided, authentication will be disabled. If provided, it will be used to authenticate against the website using the Authorization header, passed as a bearer token.
- `SITEMAP_URL` - The URL of the sitemap to use for scraping. This is required.

Additionally, you must configure a D1 database and Queues instance. They should be configured in the `wrangler.toml` file:

```toml
[[ d1_databases ]]
binding = "DB"
database_name = "{{database_name}}"
database_id = "{{database_id}}"
preview_database_id = "{{database_preview_id}}"

[[queues.producers]]
  queue = "{{queue_name}}"
  binding = "QUEUE"

[[queues.consumers]]
  queue = "{{queue_name}}"
  max_batch_size = 10
  max_batch_timeout = 30
  max_retries = 10
  dead_letter_queue = "{{dlq_queue_name}}"
```

Finally, you must enable a cron trigger to run the scraper. This is configured in the `wrangler.toml` file:

```toml
[triggers]
crons = ["0 0 * * *"]
```
