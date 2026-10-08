---
"miniflare": patch
"@cloudflare/workflows-shared": patch
---

Fix local Workflows running out of file handles after many instances finish

Finished local Workflow instances now release their engine once it is idle, instead of keeping its storage files open until workerd fails with "Too many open files". Their status and output stay available.
