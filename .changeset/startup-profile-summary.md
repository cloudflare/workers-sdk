---
"wrangler": minor
---

Show bundle size and a local timing summary from `wrangler check startup`

The command now reports its local profile window, sampled active, garbage collection, and idle time alongside the raw and compressed bundle sizes. The existing warning continues to distinguish these local measurements from startup time measured on Cloudflare.
