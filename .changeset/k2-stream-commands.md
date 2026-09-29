---
"wrangler": minor
"@cloudflare/workers-auth": minor
---

Add beta K2 stream management commands

Use `wrangler k2 streams create order_events`, `wrangler k2 streams list`, `wrangler k2 streams get <stream-id>`, and `wrangler k2 streams delete <stream-id>` to manage K2 streams. Creation enables Worker bindings but not HTTP ingestion by default, matching the dashboard. Pass `--http-enabled` to enable authenticated HTTP ingestion and print its endpoint. Creation prints the stream ID and a binding configuration with a `YOUR_BINDING_NAME` placeholder for the Worker's variable name, but does not edit the configuration file automatically.

All four commands support `--json`. Deletion requires confirmation, or `--force`/`-y` to skip it; use `--force --json` for JSON deletion output. Creation also accepts retention, HTTP authentication, Worker-input, and CORS options; listing supports pagination and a name filter. Default Wrangler logins now request `k2.read` and `k2.write`; existing OAuth users should run `wrangler login` again, or use a custom API token granting K2 Config Write. The account must be enabled for K2.
