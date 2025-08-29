---
"@cloudflare/vitest-pool-workers": minor
"@cloudflare/workflows-shared": minor
"miniflare": patch
---

Workflows test support to "cloudflare:test" module.

"cloudfalre:test" module has two new APIs: `introspectWorkflowInstance`and `itrospectWorkflow` to allow changing the behavior of one/multiple Workflow instances created during tests.

workflows-shared has rpc functions to allow workflows instances chnages during tests.

Miniflare DO plugin has an `unsafeScriptName` in DurableObjectsOptionsSchema, to allow defining a DO serviceName without the 'core:user:' prefix.
