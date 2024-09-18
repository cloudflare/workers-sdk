---
"create-cloudflare": patch
---

fix: add missing `nodejs_compat` flag to c3 qwik template

The c3 qwik template doesn't include the `nodejs_compat` but qwik seems to be using
AsyncLocalStorage, so newly created applications do display a warning regarding it
missing, fix the above issue by adding the missing compat flag
