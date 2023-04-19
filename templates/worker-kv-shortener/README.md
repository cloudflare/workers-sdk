# Template: worker-kv-shortener

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/worker-kv-shortener)

This project is based off the Default Typescript Worker starter. To create a new project like this, run the following:

```sh
npx wrangler init -y
```

Then copy the `src` and the `data` directory from this template into your project.

Alternatively:

```sh
git clone https://github.com/cloudflare/workers-sdk.git
cd templates
npm init cloudflare worker-kv-shortener
```

### Getting started

Next, run the following commands in the console:

```sh
# Make sure you've logged in
npx wrangler login

# Create the KV Store
npx wrangler kv:namespace create SHORTENER_KV

# Add config to wrangler.toml as instructed

# If you're creating a new project, you'll need to install some dependencies:
npm install --save hono

# You can automatically generate the types for your environment by running:
npx wrangler types

# Deploy the worker
npx wrangler publish
```

Then test out your new Worker!
