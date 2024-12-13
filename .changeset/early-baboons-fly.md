---
"wrangler": minor
---

feat: allow routing to Workers with Assets on any HTTP route, not just the root. For example, `example.com/blog/*` can now be used to serve assets.
These assets will be served as though the assets directly were mounted to the root.
For example, if you have `assets = { directory = "./public/" }`, a route like `"example.com/blog/*"` and a file `./public/blog/logo.png`, this will be available at `example.com/blog/logo.png`. Assets outside of directories which match the configured HTTP routes can still be accessed with the [Assets binding](https://developers.cloudflare.com/workers/static-assets/binding/#binding) or with a [Service binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/) to this Worker.
