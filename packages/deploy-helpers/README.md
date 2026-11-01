# `@cloudflare/deploy-helpers`

Shared Worker upload, deployment, trigger, and Preview workflows for tooling.
These APIs are internal and may change without notice.

Import the entry point for the workflow your command needs:

```ts
import { initDeployHelpersContext } from "@cloudflare/deploy-helpers/context";
import { deploy } from "@cloudflare/deploy-helpers/deploy";
import { versionsUpload } from "@cloudflare/deploy-helpers/versions-upload";
import { triggersDeploy } from "@cloudflare/deploy-helpers/triggers";
import { previewBuildOutput } from "@cloudflare/deploy-helpers/preview";
```

Initialize the context before calling a workflow. All entry points share the same
context, including the existing root entry point, which retains its exports.
Workflow entry points can be imported without loading Miniflare's runtime or
resolving the workerd binary.

`@cloudflare/deploy-helpers/create-worker-upload-form` constructs uploads without
the deployment workflows. `@cloudflare/deploy-helpers/startup-profile` runs Workers
locally and requires workerd. Upload startup-failure diagnostics load that runtime
entry point on demand.
