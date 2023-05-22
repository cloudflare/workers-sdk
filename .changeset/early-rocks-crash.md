---
"create-cloudflare": patch
---

fix: add polling for deployed Pages projects

When create-cloudflare deploys to Pages, it can take a while before the website is ready to be viewed.
This change adds back in polling of the site and then opening a browser when the URL is ready.
