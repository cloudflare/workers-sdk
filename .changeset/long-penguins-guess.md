---
"wrangler": patch
---

chore: remove `experimental_services` from configuration

Now that we have `[[unsafe.bindings]]` (as of https://github.com/cloudflare/wrangler2/pull/411), we should use that for experimental features. This removes support for `[experimental_services]`, and adds a helpful message for how to rewrite their configuration.

This error is temporary, until the internal teams that were using this rewrite their configs. We'll remove it before GA.

What the error looks like -

```
Error: The "experimental_services" field is no longer supported. Instead, use [[unsafe.bindings]] to enable experimental features. Add this to your wrangler.toml:

[[unsafe.bindings]]
name = "SomeService"
type = "service"
service = "some-service"
environment = "staging"

[[unsafe.bindings]]
name = "SomeOtherService"
type = "service"
service = "some-other-service"
environment = "qa"
```
