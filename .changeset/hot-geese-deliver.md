---
"wrangler": minor
---

feature: remove requirement for `@cloudflare/ai` package to use Workers AI

Previously, to get the correct Workers AI API, you needed to wrap your `env.AI` binding with `new Ai()` from `@cloudflare/ai`. This change moves the contents of `@cloudflare/ai` into the Workers runtime itself, meaning `env.AI` is now an instance of `Ai`, without the need for wrapping.
