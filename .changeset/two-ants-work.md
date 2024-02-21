---
"create-cloudflare": patch
---

feature: Add script to Qwik template for building Env type definitions.

When creating a project with the Qwik template, the `QwikCityPlatform` type will be updated to contain a definition for the `env` property. These types can be re-generated with a newly added `build-cf-types` script.
