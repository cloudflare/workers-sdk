---
"create-cloudflare": patch
---

Generate Workflow name based on worker name in hello-world-workflows template.

Previously, the hello-world-workflows template defaulted to the workflow name
`workflows-hello-world`. This caused deployments to overwrite existing workflows when
users forgot to change the name, since workflow names must be unique. The workflow
name is now generated from the worker name.
