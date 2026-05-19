---
"@cloudflare/containers-shared": patch
---

Refactor `verifyDockerInstalled` to accept an options object instead of positional parameters

The function signature changed from `(dockerPath: string, isDev?: boolean)` to `({ dockerPath, isDev }: { dockerPath: string; isDev?: boolean })` for improved readability and extensibility.
