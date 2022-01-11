---
"wrangler": patch
---

refactor: proxy/preview server

This PR refactors how we setup the proxy server between the developer and the edge preview service during `wrangler dev`. Of note, we start the server immediately. We also buffer requests/streams and hold on to them, when starting/refreshing the token. This means a developer should never see `ERR_CONNECTION_REFUSED` error page, or have an older worker respond after making a change to the code. And when the token does get refreshed, we flush said streams/requests with the newer values, making the iteration process a lot smoother and predictable.
