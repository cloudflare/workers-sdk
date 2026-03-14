---
"@cloudflare/vitest-pool-workers": minor
---

Add `disableRetryDelays()` to `WorkflowInstanceModifier` to skip retry backoff delays in tests

When testing Workflows with retry configurations, the backoff delays between retry attempts of a failing `step.do()` caused real wall-clock waiting (e.g., 35 seconds for 3 retries with 5-second exponential backoff), even when step results were fully mocked. The new `disableRetryDelays()` method eliminates these delays while preserving retry behavior — all attempts still execute, just without waiting between them.
