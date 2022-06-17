---
"wrangler": patch
---

fix: kv:key put/get binary file

As raised in https://github.com/cloudflare/wrangler2/issues/1254, it was discovered that binary uploads were being mangled by wrangler 2, whereas they worked in wrangler 1. This is because they were read into a string by providing an explicit encoding of `utf-8`. This fix reads provided files into a node `Buffer` that is then passed directly to the request.

Subsequently https://github.com/cloudflare/wrangler2/issues/1273 was raised in relation to a similar issue with gets from wrangler 2. This was happening due to the downloaded file being converted to `utf-8` encoding as it was pushed through `console.log`. By leveraging `process.stdout.write` we can push the fetched `ArrayBuffer` to std out directly without inferring any specific encoding value.
