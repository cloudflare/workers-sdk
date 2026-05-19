---
"@cloudflare/containers-shared": patch
"wrangler": patch
---

Preserve sibling container image tags during local dev cleanup

Wrangler now keeps other `cloudflare-dev` image tags from the same dev session when multiple containers share a Dockerfile. Previously, duplicate-image cleanup could remove earlier container tags if Docker BuildKit produced the same image ID for each build.
