---
"miniflare": minor
"@cloudflare/workflows-shared": minor
---

Enforce Workflow step concurrency keys in local development

A `step.do()` with a `concurrency` key now waits while the key is at its limit, as it does when deployed. Every Workflow and Worker in one `wrangler dev`, Vite or Vitest session shares the same keys, which persist with the rest of the local Workflows state. A waiting step behaves like a sleep: the rest of the instance keeps running, and the step continues as soon as a slot frees. A step that references a key that does not exist locally runs without a limit and logs a warning once per key.
