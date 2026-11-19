---
"@cloudflare/autoconfig": patch
---

Warn which Nitro options stop applying when autoconfig sets up SolidStart for cf

Autoconfig removes Nitro from SolidStart projects because it is incompatible with the Cloudflare Vite plugin. When Nitro was configured with options, such as `nitro({ prerender: { crawlLinks: true } })` in SolidStart's `with-solidbase` template, autoconfig now warns that they no longer apply instead of dropping them silently.
