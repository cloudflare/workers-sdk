---
"miniflare": minor
---

Add experimental `dev.unsafeWorkloadIdentityService` injection for testing the native `ctx.identity.caller()` API with an explicit service. It requires a companion runtime with caller support. Local credentials fail unavailable by default; a mock service establishes no cryptographic trust.

Carry native caller facts for direct local Worker service bindings, including fetch and top-level RPC. Exclude Miniflare ingress routing from caller attribution. Require a companion runtime and type-generation bundle that include the service-binding caller variant.
