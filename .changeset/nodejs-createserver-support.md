---
"wrangler": minor
---

Add automatic detection and adaptation of Node.js HTTP servers using createServer for Cloudflare Workers deployment

The deploy command now automatically detects Node.js projects that use `http.createServer()` or `https.createServer()` and adapts them to work on Cloudflare Workers by:

- Adding the required `import { httpServerHandler } from 'cloudflare:node'`
- Exporting `httpServerHandler({ port })` as the default export
- Generating a wrangler.jsonc configuration with the `nodejs_compat` compatibility flag

This enables seamless deployment of traditional Node.js HTTP servers to Cloudflare Workers without manual code changes.
