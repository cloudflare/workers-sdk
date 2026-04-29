---
"miniflare": patch
---

Expose `send_email` bindings from `getPlatformProxy()`

Projects developing in Node can now access `send_email` bindings from the platform proxy. This supports the plain-object MessageBuilder API locally, so calls like `env.EMAIL.send({ from, to, subject, text })` no longer fail because the binding is missing.
