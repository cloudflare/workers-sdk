---
"@cloudflare/vitest-pool-workers": minor
"@cloudflare/workflows-shared": minor
"miniflare": patch
---

Add Workflows test support to the `cloudflare:test` module.

The `cloudflare:test` module has two new APIs: 
- `introspectWorkflowInstance`
- `introspectWorkflow` 
which allow changing the behavior of one or multiple Workflow instances created during tests.


Miniflare DO plugin has an `unsafeScriptName` in DurableObjectsOptionsSchema, to allow defining a DO serviceName without the 'core:user:' prefix.
