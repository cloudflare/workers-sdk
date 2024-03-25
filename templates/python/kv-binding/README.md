# Template: Workers KV <> Python Workers

## Note: You must use [wrangler](https://developers.cloudflare.com/workers/cli-wrangler/install-update) 3.37.0 or newer to use this template.

A template that shows how [bindings](https://developers.cloudflare.com/workers/configuration/bindings/) can be used when writing Workers in Python.

## Get started

1. Clone this repository
2. Run `npx wrangler@latest kv:namespace create python-worker-kv-test` to create a [Workers KV](https://developers.cloudflare.com/kv/) namespace
3. Replace `<YOUR_KV_NAMESPACE_ID>` in `wrangler.toml` with the ID of the namespace you just created
4. Run `npx wrangler@latest dev` to run this Worker locally
5. Run `npx wrangler@latest deploy` to deploy this Worker to Cloudflare

## Resources

- [Python Workers documentation](https://ggu-python.cloudflare-docs-7ou.pages.dev/workers/languages/python/)