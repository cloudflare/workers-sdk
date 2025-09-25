---
"@cloudflare/vite-plugin": patch
---

Add request cancellation support

Workers running on Vite can now listen to the abort event with `request.signal` to perform tasks when the request is canceled by the client. For more information, see the [Request](https://developers.cloudflare.com/workers/runtime-apis/request) documentation.
