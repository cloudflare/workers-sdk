---
"wrangler": patch
---

Fix container deployment being skipped for Workers for Platforms user workers

Previously, deploying a worker with `--dispatch-namespace` would early-exit before calling `deployContainers()`, meaning container-app registration that links the image to the Durable Object namespace was never executed for WfP user workers. Container deployment now runs before the WfP early exit.
