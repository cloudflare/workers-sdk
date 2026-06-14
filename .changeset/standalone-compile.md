---
"wrangler": minor
"miniflare": minor
"@cloudflare/vite-plugin": minor
---

Add an experimental `wrangler compile` command (and Vite `standalone` mode) for self-hosting Workers on standalone `workerd`

`wrangler compile` builds your Worker into a self-contained `workerd` bundle (a `config.capnp`, embedded modules, on-disk static assets, a version-pinned `Dockerfile`, an entrypoint, and a `README.md` with run instructions) that you can run on any server outside of Cloudflare. Static assets are wired up out of the box. Pass `--serve` to run the emitted bundle locally with the bundled `workerd` binary — the exact artifact that ships. Pass `--format binary` to emit a single self-contained `config.bin` instead of the human-readable `config.capnp` plus embedded module files.

You can also set `"standalone": true` in your configuration (or pass `--standalone` to `wrangler dev`) to opt in. When set, `wrangler dev` warns about bindings that work locally but are not yet supported by standalone `workerd`, and `wrangler deploy` errors (since the Worker targets a self-hosted runtime rather than Cloudflare).

For Vite projects, pass `standalone: true` to the `cloudflare()` plugin and `vite build` will also emit the same standalone bundle:

```ts
// vite.config.ts
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [cloudflare({ standalone: true })],
});
```

```jsonc
// wrangler.json
{
	"name": "my-worker",
	"main": "src/index.js",
	"compatibility_date": "2025-05-01",
	"standalone": true,
	"assets": { "directory": "./public", "binding": "ASSETS" },
}
```

This is experimental and currently targets stateless Workers plus static assets; stateful bindings (KV, R2, D1, Durable Objects, etc.) are not yet supported.
