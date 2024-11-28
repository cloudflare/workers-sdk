---
"create-cloudflare": patch
---

fixed: related to issues-7341
AngularAppEngine class does not have '.render' method,
instead it should be '.handle' method.
