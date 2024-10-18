---
"wrangler": minor
---

Add support for Workflow bindings (in deployments, not yet in local dev)

To bind to a workflow, add a `workflows` section in your wrangler.toml:

```toml
[[workflows]]
binding = "WORKFLOW"
name = "my-workflow"
class_name = "MyDemoWorkflow"
```

and export an entrypoint (e.g. `MyDemoWorkflow`) in your script:

```typescript
import { WorkflowEntrypoint } from "cloudflare:workers";

export class MyDemoWorkflow extends WorkflowEntrypoint<Env, Params> {...}
```
