---
"create-cloudflare": minor
---

Make vinext the default Next.js scaffold, keep OpenNext as a variant

`create-cloudflare --framework=next` now prompts for a Next.js adapter:

- **vinext** (default / recommended) — scaffolds via `create-vinext-app` (`vinext dev` / `vinext build` / `vinext-cloudflare deploy`)
- **opennext** — keeps the previous OpenNext remote template for projects that need standard `next build` output or a capability vinext does not support yet

Non-interactive usage:

```sh
npm create cloudflare@latest my-app -- --framework=next --variant=vinext
npm create cloudflare@latest my-app -- --framework=next --variant=opennext
```

`-y` / `--accept-defaults` selects vinext. This aligns C3 with the recommended Next.js-on-Workers path in the Cloudflare docs while preserving an opt-in OpenNext path.
