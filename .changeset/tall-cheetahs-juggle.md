---
"wrangler": patch
---

fix: propagate api errors to the terminal correctly

Any errors embedded in the response from the Cloudflare API were being lost, because `fetchInternal()` would throw on a non-200 response. This PR fixes that behaviour:

- It doesn't throw on non-200 responses
- It first gets the response text with `.text()` and converts it to an object with `JSON.parse`, so in case the api returns a non json response, we don't lose response we were sent.

Unfortunately, because of the nature of this abstraction, we do lose the response `status` code and `statusText`, but maybe that's acceptable since we have richer error information in the payload. I considered logging the code and text to the terminal, but that may make it noisy.
