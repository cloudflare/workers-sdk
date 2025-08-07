---
"miniflare": patch
---

fix: support WebSocket proxying to workerd

The dev registry proxy server now correctly handles WebSocket upgrade requests and
tunnels bidirectional frames between the workerd processes. Previously,
handshakes would fail due to missing upgrade logic.
