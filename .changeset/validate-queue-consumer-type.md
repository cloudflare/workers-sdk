---
"wrangler": patch
"@cloudflare/workers-utils": patch
---

Validate that queue consumers in wrangler config only use the "worker" type

Previously, non-worker consumer types (e.g. `http_pull`) could be specified in the `queues.consumers` config. Now, wrangler will error if a consumer `type` other than `"worker"` is specified in the config file.

To configure non-worker consumer types, use the `wrangler queues consumer` CLI commands instead (e.g. `wrangler queues consumer http-pull add`).
