---
"wrangler": minor
---

Expand automatic resource provisioning to Queue, Dispatch Namespace, and Flagship bindings

Deployments can now omit the resource name or ID for these bindings. Wrangler will inherit the existing binding on subsequent deploys, create a deterministically named resource automatically, or offer existing resources during an interactive deploy with automatic creation disabled.
