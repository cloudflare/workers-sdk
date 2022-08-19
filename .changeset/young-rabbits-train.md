---
"node-app-pages": patch
"pages-functions-app": patch
"pages-workerjs-app": patch
"remix-pages-app": patch
"wrangler": patch
"wranglerjs-compat-webpack-plugin": patch
---

chore: bump undici and increase minimum node version to 16.13

- We bump undici to version to 5.9.1 to patch some security vulnerabilities in previous versions
- This requires bumping the minimum node version to >= 16.8 so we update the minimum to the LTS 16.13

Fixes https://github.com/cloudflare/wrangler2/issues/1684
