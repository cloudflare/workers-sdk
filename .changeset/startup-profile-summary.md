---
"wrangler": minor
---

Graduate `wrangler check startup` from alpha and show bundle size and a local timing summary

The command no longer prints an alpha warning. It now reports its local profile window, sampled active, garbage collection, and idle time alongside the raw and compressed bundle sizes. The existing measurement warning continues to distinguish these local measurements from startup time measured on Cloudflare.
