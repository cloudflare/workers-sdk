---
"miniflare": minor
"wrangler": minor
"@cloudflare/workers-utils": minor
---

Add support for the new `web_search` binding kind.

Cloudflare Web Search is a managed, zero-setup web discovery primitive for agents and Workers. Declare the binding as a single object in `wrangler.jsonc`:

```jsonc
{
	"web_search": { "binding": "WEBSEARCH" },
}
```

There is exactly one shared web corpus, so there is no namespace, instance, or other field to specify -- only the variable name. The binding exposes a single `search()` method that returns URLs and catalog metadata for a query. Web Search is discovery-only -- to read a result's content the caller invokes the global `fetch()` API against the result's `url`.

The binding is **always remote** in local development: Miniflare proxies to the production Web Search service via the remote-bindings transport. Adds the `websearch.run` OAuth scope to `wrangler login`.

Also adds a `wrangler websearch search` command for running ad-hoc queries from the CLI:

```sh
npx wrangler websearch search "cloudflare workers"
npx wrangler websearch search "cloudflare workers" --limit 5
npx wrangler websearch search "cloudflare workers" --json
```

`--limit` is optional (defaults to 10, capped at 20). `--json` prints the raw response; without it the results render as a pretty table.
