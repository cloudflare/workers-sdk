---
"@cloudflare/vite-plugin": minor
---

Update `getLocalWorkerdCompatibilityDate` to return today's date

The re-exported `getLocalWorkerdCompatibilityDate` function from `@cloudflare/vite-plugin` previously resolved the workerd compatibility date by traversing the local `miniflare` installation, which was unreliable in some package manager setups. It now simply returns today's date. The function is also marked as deprecated — callers should just use today's date instead, for example like so: `new Date().toISOString().slice(0, 10)`
