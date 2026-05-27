---
"wrangler": minor
---

Support deleting secrets via `wrangler secret bulk`

You can now delete secrets in bulk by setting their value to `null` in the JSON input file:

```json
{ "SECRET_TO_DELETE": null, "SECRET_TO_UPDATE": "new-value" }
```
