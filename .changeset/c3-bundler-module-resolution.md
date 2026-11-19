---
"create-cloudflare": patch
---

Use `bundler` module resolution in the remaining TypeScript Worker templates

The common, Durable Object, Workflows, Queues, and Scheduled TypeScript templates used `moduleResolution: "node"`, which TypeScript 6 deprecates. New projects created from these templates now use `bundler` resolution, matching the other Worker templates and the way Wrangler bundles Worker code.
