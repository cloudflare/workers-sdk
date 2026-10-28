---
"@cloudflare/vite-plugin": patch
---

Preserve machine-readable error properties from remote bindings

Enable enhanced error serialization on the remote proxy Worker used by Vite plugin v1. Combined with Miniflare 5.20261023.1-beta, remote binding errors retain properties such as `code` and `numericCode` so Worker code can handle them without parsing error messages.
