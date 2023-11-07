---
"create-cloudflare": patch
---

Changes c3 to use `npx` for running framework creation tools when it is invoked with `yarn`. This is
needed since yarn can't `yarn create some-package@some-particular-version`.
