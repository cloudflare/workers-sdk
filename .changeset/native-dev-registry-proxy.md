---
"miniflare": minor
"wrangler": patch
"@cloudflare/vite-plugin": patch
---

Replace the Node.js worker-thread HTTP proxy for the dev registry with native workerd debug port RPC. Cross-process service bindings, tail workers, and Durable Objects now route through workerd's `--debug-port` and a `DiskDirectory` service instead of an HTTP/CONNECT proxy server. This enables Durable Object RPC across dev sessions (previously unsupported) and eliminates a class of WebSocket proxying and deadlock issues.

**BREAKING CHANGE**: The internal on-disk format for the `unsafeDevRegistryPath` has changed. This is an internal, unsafe, and undocumented feature, but any tools relying on its previous structure will need to be updated to support the new `debugPortAddress`, `defaultEntrypointService`, and `userWorkerService` properties in worker-definition files. The `unsafeDevRegistryDurableObjectProxy` option has been removed.
