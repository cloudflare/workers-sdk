---
"@cloudflare/vite-plugin": patch
---

Update the v1 development runtime to Miniflare 5.20261103.0-beta

Use the November 3 workerd runtime with matching Wrangler 4.157.0 and default compatibility date. Local rate-limit bindings now support weighted calls using `delta`. Load the Node.js compatibility helper from workers-utils so v1 continues to build and run after Miniflare removes its deprecated export.
