---
"wrangler": patch
---

Reorder deploy output when deploying a container worker so the worker url is printed last and the worker triggers aren't deployed until the container has been built and deployed successfully.
