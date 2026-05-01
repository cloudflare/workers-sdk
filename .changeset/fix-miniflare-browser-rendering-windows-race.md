---
"miniflare": patch
---

Fix race condition that broke Browser Run on Windows when Chrome had not yet started accepting connections

When Miniflare launched Chrome for Browser Run bindings, it returned the WebSocket endpoint as soon as Chrome printed its `DevTools listening on ws://...` banner. On Windows the underlying listening socket is occasionally not yet accepting connections at that point, causing the first request from workerd to Chrome to fail with `ConnectEx (#1225) The remote computer refused the network connection.` and the user worker to receive an error response from `/v1/acquire`.

Miniflare now probes Chrome's `/json/version` HTTP endpoint with retry/backoff after the banner is logged, only declaring the browser ready once the socket actually accepts connections. As an additional safety net, the browser binding worker also retries transient `ConnectEx`/`WSARecv` failures when establishing connections to Chrome.
