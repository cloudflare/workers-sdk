---
"wrangler": patch
---

Use digest-pinned image references for Dockerfile container deploys

Dockerfile-backed container deploys now use the pushed image digest when deploying the container application. This lets snapshot-enabled container apps pass Cloudchamber validation while keeping local, non-pushed builds and registry image URI deploys unchanged.
