---
"@cloudflare/workers-shared": patch
---

Add cohort-based deployment support to the asset worker

The asset worker now resolves deployment cohorts via the AccountCohortQuerier RPC binding before forwarding requests through the loopback. This enables gradual rollouts of new asset worker versions by routing requests to different versions based on the customer account's cohort assignment.

Both the outer and inner entrypoints now write analytics independently with an entrypoint discriminator, and the outer records the cohort and response status so that SLO queries can use a single entrypoint for availability and latency metrics.
