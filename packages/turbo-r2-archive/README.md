# Turbo R2 Archive

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jacobMGEvans/Turbo-R2-Archive)

## Overview

This is a Worker that will act as an event server for caching TurboRepo artifacts. Compliant with the TurboRepo API, for remote caching, it will store the cache artifacts in a Cloudflare R2 bucket and purge the R2 Objects on a schedule, using [R2 Object lifecycle rules](https://blog.cloudflare.com/introducing-object-lifecycle-management-for-cloudflare-r2/). This allows for all the benefits of remote caching TurboRepo artifacts on Cloudflare's edge network.

This will require a Cloudflare account, with a zone and R2.

## Environment Variables

Utilizing `.env` file to store the variables for Turborepo API & Worker. The `.env` file should be in the root of the project directory. The `.env` file should contain the following variables. Be sure to add the `.env` file to `.gitignore` to prevent it from being committed to the repository.

The commands are ran with `dotenv` cli `npx dotenv -- npx turbo <command>` to inject the environment variables into the command process environment.

```bash
TURBO_API=<baseURL> # https://something.com
TURBO_TEAM=<value> # team_whatever it has to start with prefix team_
TURBO_TOKEN=<value> # whatever is set in the worker secret
TURBO_REMOTE_CACHE_SIGNATURE_KEY=<value> # needs to be the same for every one using the same cache
```

## Turbo Project Config

To utilize the `TURBO_REMOTE_CACHE_SIGNATURE_KEY` which will increase the security of the remote cache, the project config will need to be updated to include the following:

```json
{
	"remoteCache": { "signature": true }
}
```

## Worker Configuration

```jsonc
{
	"r2_buckets": [
		{
			"binding": "R2_ARTIFACT_ARCHIVE", // The binding name for the bucket, used in the Worker i.e. env.R2_ARTIFACT_ARCHIVE.get(<key>)
			"bucket_name": "turbo-cache", // bucket name when looking for objects in dashboard
			"preview_bucket_name": "turbo-cache-preview"
		}
	]
}
```

The endpoints are protected by a bearer token. The token is stored as a secret in the Worker. The token can be set with the following command:

```bash
echo <VALUE> | wrangler secret put TURBO_TOKEN
```

<!-- Add the setting up the R2 bucket & Object Rules -->

### Manual Cache Purge

The cache can also be purged manually by sending a `POST` request to the `<baseURL>/artifacts/manual-cache-bust` endpoint. This can be done with the following command:

```bash
https -A bearer -a <TURBO_TOKEN> POST <baseURL>/artifacts/manual-cache-bust
```

## How can I develop & test locally?

This project is primarily self-service and is meant to be forked and modified to fit your needs. The following instructions will help you get started.

### Running the Worker Locally

The Worker can be run, locally with the `package.json` script `start`:

```bash
npm run start
```

### TurboRepo Testing Local Server

Well since we are already using Cloudflare, let's keep that going. `cloudflared` allows for creating a tunnel to your `http://127.0.0.1:8787` and exposing it to the internet. This will allow others direct their TurboRepo to the local dev server by setting`TURBO_API` to `<host>`.
The command to create a tunnel looks like:

```bash
cloudflared tunnel --hostname <host> --url http://127.0.0.1:8787/ --name r2-archive (or whatever you want to name it)
```

## How can I deploy this?

Fork this repo, have a Cloudflare account, and run the following command:

```bash
npm run deploy
```

You now have a TurboRepo API compliant event server that will cache artifacts on Cloudflare's edge network.
