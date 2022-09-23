---
"wrangler": patch
---

feat: expose port and address on (Unstable)DevWorker

when using `unstable_dev()`, I think we want to expose the port/address that the server has started on. The usecase is when trying to connect to the server _without_ calling `.fetch()` (example: when making a websocket connection).
