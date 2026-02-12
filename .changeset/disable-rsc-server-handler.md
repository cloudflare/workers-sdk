---
"@cloudflare/vite-plugin": minor
---

Set `{ serverHandler: false }` automatically when using `@vitejs/plugin-rsc`

By default, `@vitejs/plugin-rsc` adds dev and preview server middleware that imports the RSC entry in Node.js. This fails with `cloudflare:*` imports (`ERR_UNSUPPORTED_ESM_URL_SCHEME`) and is unnecessary since the Cloudflare plugin handles requests via workerd. Users no longer need to pass `rsc({ serverHandler: false })` manually.
