---
"wrangler": patch
---

fix: work with Cloudflare WARP

Using wrangler with Cloudflare WARP (https://developers.cloudflare.com/cloudflare-one/connections/connect-devices/warp/) requires using the Cloudflare certificate. This patch simply uses the certificate as NODE_EXTRA_CA_CERTS when we start wrangler.

Test plan:

- Turn on Cloudflare WARP/ Gateway with WARP
- `wrangler dev`
- Turn on Cloudflare WARP/ Gateway with DoH
- `wrangler dev`
- Turn off Cloudflare WARP
- `wrangler dev`

Fixes https://github.com/cloudflare/wrangler2/issues/953, https://github.com/cloudflare/wrangler2/issues/850
