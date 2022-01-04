---
"wrangler": patch
---

Refactor raw value extraction from Cloudflare APIs

Most API responses are JSON of the form:

```
{ result, success, errors, messages, result_info }
```

where the `result` contains the actual response value.

But some API responses only contain the result value.

This change refactors the client-side fetch API to allow callers to specify what kind of response they expect.
