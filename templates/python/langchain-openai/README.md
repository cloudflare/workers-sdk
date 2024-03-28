# Template: Langchain <> OpenAI

## Note: You must use [wrangler](https://developers.cloudflare.com/workers/cli-wrangler/install-update) 3.37.0 or newer to use this template.

A template for using [Langchain](https://python.langchain.com/docs/get_started/introduction) with Cloudflare Workers

## Get started

1. Clone this repository
2. Add your API key for OpenAI as a [secret](https://developers.cloudflare.com/workers/configuration/secrets/) to your Worker
3. Run `npx wrangler@latest dev` to run this Worker locally
4. Run `npx wrangler@latest deploy` to deploy this Worker to Cloudflare

## Resources

- [Python Workers documentation](https://ggu-python.cloudflare-docs-7ou.pages.dev/workers/languages/python/)