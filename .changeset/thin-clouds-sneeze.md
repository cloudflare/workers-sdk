---
"create-cloudflare": patch
---

improve the Nuxt deployment script so that it ships full stack applications (instead of server-side generated ones)

as part of this change update the Nuxt build script to include the `NITRO_PRESET` env variable set to `cloudflare-pages` (needed to build Pages compatible applications)

also write a .node-version file with the node version (so that it can properly working with the Pages CI)
