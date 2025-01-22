---
wrangler: patch
---

Revert https://github.com/cloudflare/workers-sdk/pull/7816. This feature added support for the ASSETS bindings to the `getPlatformProxy()` API, but caused a regression when running `npm run preview` in newly generated Workers Assets projects.
