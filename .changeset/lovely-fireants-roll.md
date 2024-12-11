---
"@cloudflare/workflows-shared": patch
---

Fixed a bug in local development where fetching a Workflow instance by ID would return a Workflow status, even if that instance did not exist. This only impacted the `get()` method on the Worker bindings. 
