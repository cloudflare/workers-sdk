---
"@cloudflare/config": patch
"@cloudflare/vitest-plugin": patch
"@cloudflare/vite-plugin": patch
"wrangler": patch
---

Treat a `cloudflare.config.ts` Durable Object binding to the Worker's own class as local

A Durable Object binding's `worker` is required, so a binding to one of the Worker's own classes names the Worker itself. The conversion to Wrangler config emitted that name as `script_name`, which made the binding look like it pointed at another Worker. `@cloudflare/vitest-plugin` then failed to start with "no such service is defined", and attaching a container to the Durable Object was rejected. The conversion now omits `script_name` when it names the Worker itself, matching a local binding in a Wrangler configuration file.
