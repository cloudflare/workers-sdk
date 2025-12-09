---
"create-cloudflare": patch
---

Update help message not to recommend non-applicable `--ts` create-next-app argument

C3 uses it's own template when running create-next-app, so providing a `--ts` argument to it doesn't have any effect, the C3 help message however shows that as an example on how to pass arguments to underlying framework CLIs. The changes here update the error message to instead use svelte's `--types=ts` as the example
