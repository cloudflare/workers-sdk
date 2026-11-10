---
"@cloudflare/workers-utils": patch
"@cloudflare/edge-preview-authenticated-proxy": patch
"@cloudflare/format-errors": patch
---

Build the `prometheus-metrics` export without the Node.js `createRequire` banner

The banner imports `node:module`, so Workers that bundle `@cloudflare/workers-utils/prometheus-metrics` without `nodejs_compat` failed to upload with `No such module "node:module"`. This blocked the `edge-preview-authenticated-proxy@0.3.5` deploy. The export has no CommonJS dependencies, so it is now built alongside the browser export, which already omits the banner.
