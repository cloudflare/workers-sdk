---
"miniflare": minor
---

Add environment variables to control cf.json fetching behavior

You can now use environment variables to control how Miniflare handles the `Request.cf` object caching:

- `CLOUDFLARE_CF_FETCH_ENABLED` - Set to "false" to disable fetching entirely and use fallback data. No `node_modules/.mf/cf.json` file will be created. Defaults to "true".
- `CLOUDFLARE_CF_FETCH_PATH` - Set to a custom path to use a different location for caching the cf.json file instead of the default `node_modules/.mf/cf.json`.

This is particularly useful for non-JavaScript projects (like Rust or Go Workers) that don't want a `node_modules` directory created automatically.

Example:

```sh
# Disable cf fetching for all projects
export CLOUDFLARE_CF_FETCH_ENABLED=false
npx wrangler dev

# Or use a custom cache location
export CLOUDFLARE_CF_FETCH_PATH=/tmp/.cf-cache.json
npx wrangler dev
```
