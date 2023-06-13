# Template: worker-r2

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/worker-r2)

A template for interfacing with an R2 bucket from within a Cloudflare Worker.

Please refer to the [Use R2 from Workers](https://developers.cloudflare.com/r2/data-access/workers-api/workers-api-usage/) documentation when using this template.

## Setup

To create a `my-project` directory using this template, run:

```sh
$ npm init cloudflare my-project worker-r2 --no-delegate-c3
# or
$ yarn create cloudflare my-project worker-r2 --no-delegate-c3
# or
$ pnpm create cloudflare my-project worker-r2 --no-delegate-c3
```

> **Note:** Each command invokes [`create-cloudflare`](https://www.npmjs.com/package/create-cloudflare) for project creation.

## Getting started

Run the following commands in the console:

```sh
# Next, make sure you've logged in
npx wrangler login

# Create your R2 bucket
npx wrangler r2 bucket create <YOUR_BUCKET_NAME>

# Add config to wrangler.toml as instructed

# Deploy the worker
npx wrangler deploy
```

Then test out your new Worker!

## Note about access and privacy

With the default code in this template, every incoming request has the ability to interact with your R2 bucket. This means your bucket is publicly exposed and its contents can be accessed and modified by undesired actors.

You must define authorization logic to determine who can perform what actions to your bucket. To know more about this take a look at the [Bucket access and privacy](https://developers.cloudflare.com/r2/data-access/workers-api/workers-api-usage/#6-bucket-access-and-privacy) section of the **Use R2 from Workers** documentation
