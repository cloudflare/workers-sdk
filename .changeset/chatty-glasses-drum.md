---
"wrangler": patch
---

Make kv bulk put --local respect base64:true

The bulk put api has an optional "base64" boolean property for each key.
Before storing the key, the value should be decoded from base64.

For real (remote) kv, this is handled by the rest api. For local kv, it
seems the base64 field was ignored, meaning encoded base64 content was
stored locally rather than the raw values.

To fix, we need to decode each value before putting to the local
miniflare namespace when base64 is true.

