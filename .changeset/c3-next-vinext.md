---
"create-cloudflare": minor
---

feat: scaffold Next.js apps with vinext instead of OpenNext

`create-cloudflare --framework=next` now delegates to `create-vinext-app`, which produces a Next.js App Router project already configured for vinext and Cloudflare Workers (`vinext dev` / `vinext build` / `vinext-cloudflare deploy`).

This aligns C3 with the recommended Next.js-on-Workers path in the Cloudflare docs. The previous OpenNext-based template remains available via the OpenNext adapter docs for projects that need it.
