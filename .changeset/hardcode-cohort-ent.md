---
"@cloudflare/workers-shared": patch
---

Temporarily hardcode asset worker cohort to "ent" for latency testing

Disables the `lookupCohort` RPC call and cohort-based version routing in the outer entrypoint while keeping all the glue code (analytics, bindings, types) in place for re-enablement.
