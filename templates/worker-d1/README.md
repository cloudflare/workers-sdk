# Template: worker-d1

[![Deploy with Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/workers-sdk/tree/main/templates/worker-d1)

This project is based off the Default Typescript Worker starter. To create a new project like this, run the following:

```sh
npx wrangler@latest generate northwind-demo worker-d1
```

### Getting started

Next, run the following commands in the console:

```sh
# Make sure you've logged in
npx wrangler login

# Create the D1 Database
npx wrangler d1 create northwind-demo

# Add config to wrangler.toml as instructed

# Fill the DB with seed data from an SQL file:
npx wrangler d1 execute northwind-demo --file ./data/northwind.sql

# Deploy the worker
npx wrangler deploy
```

Then test out your new Worker!

### Developing locally

To develop on your Worker locally:

```sh
# Fill the DB with seed data from an SQL file:
npx wrangler d1 execute northwind-demo --file ./data/northwind.sql --local

# Then run wrangler dev --local with persistence
npx wrangler dev --local
```

**Note:** the local D1 development environment is under active development and may have some incorrect behaviour. If you have issues, run `npm install wrangler@latest` to make sure you're on the latest version, or provide feedback in Discord.
