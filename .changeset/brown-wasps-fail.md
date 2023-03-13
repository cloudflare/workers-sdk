---
"wrangler": minor
---

feature: add `wrangler deployment view` and `wrangler rollback` subcommands

`wrangler deployment view [deployment-id]` will get the details of a deployment, including bindings and usage model information. When using the `--content` option, the command will return the script content for that deployment.
This information can be used to help debug bad deployments or get insights on changes between deployments.

`wrangler rollback [deployment-id]` will rollback to a specific deployment in the runtime. This will be useful in situations like recovering from a bad
deployment quickly while resolving issues. If a deployment id is not specified wrangler will rollback to the previous deployment. This rollback only changes the code in the runtime and doesn't affect any code or configurations
in a developer's local setup.

example of `view <deployment-id>` output:

```ts
Deployment ID: 07d7143d-0284-427e-ba22-2d5e6e91b479
Created on:    2023-03-02T21:05:15.622446Z
Author:        jspspike@gmail.com
Source:        Upload from Wrangler 🤠
------------------------------------------------------------
Author ID:          e5a3ca86e08fb0940d3a05691310bb42
Usage Model:        bundled
Handlers:           fetch
Compatibility Date: 2022-10-03
--------------------------bindings--------------------------
[[r2_buckets]]
binding = "MY_BUCKET"
bucket_name = "testr2"

[[kv_namespaces]]
id = "79300c6d17eb4180a07270f450efe53f"
binding = "yeee"
```
