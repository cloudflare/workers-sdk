---
"wrangler": patch
---

fix: kv:key put binary file upload

As raised in https://github.com/cloudflare/wrangler2/issues/1254, it was discovered that binary uploads were being mangled by wrangler 2, whereas they worked in wrangler 1. This is because they were read into a string by providing an explicit encoding of `utf-8`. This fix reads provided files into a node `Buffer` that is then passed directly to the request.
