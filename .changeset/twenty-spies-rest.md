---
"@cloudflare/workers-utils": minor
"wrangler": minor
---

Introducing the `cache` configuration option for Workers.

You can now set `{ cache: { enabled: true } }` in your Wrangler configuration file to enable a HTTP cache in front of your Worker's `fetch` handler. More information can be found in [our documentation](https://developers.cloudflare.com/workers/cache/configuration/).