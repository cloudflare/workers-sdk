# Template: worker-d1

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/worker-d1)

> **Note: requires D1 Beta Access**

This project is based off the Default Typescript Worker starter. To create a new project like this, run the following:

```sh
npx wrangler@d1 init -y
```

> **Note the "@d1"**—we're using a prerelease version of Wrangler under the `d1` tag. You can install this into an existing Wrangler project using `npm install wrangler@d1`

Then copy the `src` and the `data` directory from this template into your project.

Alternatively:

```sh
git clone https://github.com/cloudflare/templates.git
cd templates
npm init cloudflare northwind-demo worker-d1
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
npx wrangler d1 execute northwind-demo --file ./data/Northwind.Sqlite3.create.sql

# If you're creating a new project, you'll need to install some dependencies:
npm install --save-dev itty-router @cloudflare/d1

# Deploy the worker
npx wrangler publish
```

Then test out your new Worker!

### Developing locally

To develop on your worker locally, it can be super helpful to be able to copy down a copy of your production DB to work on. To do that with D1:

```sh
# Create a fresh backup on R2
npx wrangler d1 backup create northwind-demo

# Make sure you have the directory where wrangler dev looks for local D1
mkdir -p wrangler-local-state/d1

# Copy the `id` of the backup, and download the backup into that directory
npx wrangler d1 backup download northwind-demo <backup-id> --output ./wrangler-local-state/d1/DB.sqlite3

# Then run wrangler dev --local with persistence
npx wrangler dev --local --experimental-enable-local-persistence
```

**Note:** the local D1 development environment is under active development and may have some incorrect behaviour. If you have issues, run `npm install wrangler@d1` to make sure you're on the latest version, or provide feedback in Discord.
