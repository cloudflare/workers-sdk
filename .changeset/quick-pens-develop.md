---
"wrangler": minor
---

fix: listen on IPv4 loopback only by default on Windows

Due to a [known issue](https://github.com/cloudflare/workerd/issues/1408), `workerd` will only listen on the IPv4 loopback address `127.0.0.1` when it's asked to listen on `localhost`. On Node.js > 17, `localhost` will resolve to the IPv6 loopback address, meaning requests to `workerd` would fail. This change switches to using the IPv4 loopback address throughout Wrangler on Windows, while [workerd#1408](https://github.com/cloudflare/workerd/issues/1408) gets fixed.
