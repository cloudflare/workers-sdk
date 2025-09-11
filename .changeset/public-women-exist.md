---
"@cloudflare/vitest-pool-workers": patch
---

Add Workflows test support to the `cloudflare:test` module.

The `cloudflare:test` module has two new APIs:

- `introspectWorkflowInstance`
- `introspectWorkflow`
  which allow changing the behavior of one or multiple Workflow instances created during tests.
