---
"@cloudflare/vite-plugin": patch
---

Use published SDK dependencies for Vite plugin v1 maintenance

Pin the plugin's published SDK dependencies to their deployed npm versions. Keep private shared packages as workspace dependencies so their implementation and build tools remain available on the v1 maintenance branch.
