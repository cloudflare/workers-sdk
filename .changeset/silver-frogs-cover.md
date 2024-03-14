---
"create-cloudflare": patch
---

fix: Require arguments for flags that expect them

This fixes an issue where `c3` would didn't require an argument to be passed to certain flags that expect them (ex. `--framework`, `--template`). Using these flags without an argument will now throw an error.
