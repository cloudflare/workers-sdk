---
"create-cloudflare": patch
---

Preserve existing Nuxt `modules` when adding Cloudflare configuration

Scaffolding a Nuxt application whose `nuxt.config.ts` already declares a `modules` array (for example the `ui` starter, which registers `@nuxt/ui` and `@nuxt/eslint`) previously overwrote that array when adding `nitro-cloudflare-dev`, dropping the existing modules and breaking the build. Existing entries are now retained and the Cloudflare module is appended instead.
