---
"wrangler": patch
---

Fix pagination handling of list requests to the Cloudflare API

When doing a list request to the API, the server may respond with only a single page of results.
In this case, it will also provide a `cursor` value in the `result_info` part of the response, which can be used to request the next page.
This change implements this on the client-side so that we get all the results by requesting further pages when there is a cursor.
