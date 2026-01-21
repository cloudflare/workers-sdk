---
"wrangler": minor
---

`wrangler types` now generates per-environment TypeScript interfaces when named environments exist in your configuration.

When your configuration has named environments (an `env` object), `wrangler types` now generates both:

- **Per-environment interfaces** (e.g., `StagingEnv`, `ProductionEnv`) containing only the bindings explicitly declared in each environment, plus inherited secrets
- **An aggregated `Env` interface** with all bindings from all environments (top-level + named environments), where:
  - Bindings present in **all** environments are required
  - Bindings not present in all environments are optional
  - Secrets are always required (since they're inherited everywhere)
  - Conflicting binding types across environments produce union types (e.g., `KVNamespace | R2Bucket`)

However, if your config does not contain any environments, or you manually specify an environment via `--env`, `wrangler types` will continue to generate a single interface as before.

**Example:**

Given the following `wrangler.jsonc`:

```jsonc
{
	"name": "my-worker",
	"kv_namespaces": [
		{
			"binding": "SHARED_KV",
			"id": "abc123",
		},
	],
	"env": {
		"staging": {
			"kv_namespaces": [
				{ "binding": "SHARED_KV", "id": "staging-kv" },
				{ "binding": "STAGING_CACHE", "id": "staging-cache" },
			],
		},
	},
}
```

Running `wrangler types` will generate:

```ts
declare namespace Cloudflare {
	interface StagingEnv {
		SHARED_KV: KVNamespace;
		STAGING_CACHE: KVNamespace;
	}
	interface Env {
		SHARED_KV: KVNamespace; // Required: in all environments
		STAGING_CACHE?: KVNamespace; // Optional: only in staging
	}
}
interface Env extends Cloudflare.Env {}
```
