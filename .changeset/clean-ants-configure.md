---
"@cloudflare/autoconfig": minor
---

Reject frameworks that cf cannot currently configure

Autoconfig now directs Analog, Angular, Nuxt, Qwik, Solid Start, SvelteKit, Vike, and Waku projects to Wrangler when invoked by cf, before changing project files. Wrangler autoconfiguration remains supported for these frameworks.
