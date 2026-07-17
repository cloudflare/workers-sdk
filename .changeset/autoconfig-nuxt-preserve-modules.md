---
"@cloudflare/autoconfig": patch
---

Preserve existing Nuxt `modules` when configuring a project for Cloudflare

Configuring an existing Nuxt project whose `nuxt.config.ts` already declares a `modules` array previously overwrote that array when adding `nitro-cloudflare-dev`, dropping modules such as `@nuxt/ui`. Existing entries are now retained and the Cloudflare module is appended instead.
