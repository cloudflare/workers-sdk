---
"create-cloudflare": patch
---

Bump bundled `degit` from 2.8.4 to 2.8.6 to pick up a security fix

`degit` is bundled into create-cloudflare, which uses it to download remote templates. Version 2.8.4 is affected by a published advisory, and 2.8.6 includes the fix. Template downloads work as before.
