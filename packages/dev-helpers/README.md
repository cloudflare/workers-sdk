# `@cloudflare/dev-helpers`

Internal shared development integrations for Workers SDK tools. APIs may change without notice.

Use the focused entry points:

- `@cloudflare/dev-helpers/miniflare-options` converts Wrangler configuration and bindings into legacy Miniflare options.
- `@cloudflare/dev-helpers/dev-vars` loads Wrangler-style `.dev.vars` and `.env` files.
- `@cloudflare/dev-helpers/pages-assets` creates the Pages `ASSETS` fetcher for local development.

These integrations sit above Miniflare and `workers-utils`. Keeping Wrangler compatibility here lets it evolve or be retired independently of Miniflare's runtime API. Configuration normalization and shared asset validation live in `@cloudflare/workers-utils/config`.

Logging belongs to each caller:

```ts
import { getMiniflareWorkerOptions } from "@cloudflare/dev-helpers/miniflare-options";

const options = getMiniflareWorkerOptions("wrangler.jsonc", undefined, {
	logger,
});
```

Supply a logger with `debug`, `log`, `info`, `warn` and `error` methods. An optional `once` logger controls deduplication within the caller's lifecycle. Helpers never replace a global logger.
