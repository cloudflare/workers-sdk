---
"@cloudflare/pages-shared": patch
---

feat: Slightly relax the selectors for generating `Link` headers from `<link>` elements in Pages Early Hints feature

Previously, we'd only generate `Link` headers if the `rel="preload"` or `rel="preconnect"` matched exactly. Now, this change will generate `Link` headers if `preload` or `preconnect` appears as a whitespace-separated value in the `rel` attribute. For example, `rel="stylesheet preconnect"` is now valid.

For more info, check out [this GitHub issue on the Cloudflare Developer Docs repo](https://github.com/cloudflare/cloudflare-docs/pull/6183#issuecomment-1272007522).
