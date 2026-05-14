---
"wrangler": patch
---

Propagate `unsafe.bindings` and service binding `cross_account_grant` to worker previews

Worker previews now propagate `unsafe.bindings` declared on the `previews` config block to the deployment metadata, mirroring the deploy-time behavior. Without this, internal binding shapes that wrangler doesn't yet model (notably service bindings carrying `cross_account_grant`) were silently dropped on previews while working fine on regular deploys. The same change wires through `cross_account_grant` on typed `services` bindings.
