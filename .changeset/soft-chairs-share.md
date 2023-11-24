---
"miniflare": patch
---

fix: remove `__STATIC_CONTENT_MANIFEST` from module worker `env`

When using Workers Sites with a module worker, the asset manifest must be imported from the `__STATIC_CONTENT_MANIFEST` virtual module. Miniflare provided this module, but also erroneously added `__STATIC_CONTENT_MANIFEST` to the `env` object too. Whilst this didn't break anything locally, it could cause users to develop Workers that ran locally, but not when deployed. This change ensures `env` doesn't contain `__STATIC_CONTENT_MANIFEST`.
