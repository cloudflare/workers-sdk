---
"miniflare": patch
---

Disable the keep-alive timeout on the loopback server

The loopback server (which serves custom service bindings, `@cloudflare/vite-plugin`'s module transport, and other workerd → Node callbacks) used Node's default `server.keepAliveTimeout` of 5 seconds. workerd pools and reuses connections to the loopback server, so Node closing an idle pooled socket raced with workerd sending the next request on it, making that request fail with `Network connection lost`. The failure is probabilistic and load-dependent; under `@cloudflare/vite-plugin` with a large SSR module graph and a cold optimizer cache (thousands of `fetchModule` calls with multi-second idle gaps between bursts), it broke most dev sessions. Disable the idle keep-alive timeout on the loopback server, mirroring the undici pools used for dispatch in the opposite direction.
