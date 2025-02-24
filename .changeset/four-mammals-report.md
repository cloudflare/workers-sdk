---
"create-cloudflare": patch
---

fix: remove unnecessary flags passed to `create-next-app` when creating Next.js apps in experimental mode

This change removes a set of flags that get passed to `create-next-app` that force the generated Next.js
application to have specific settings (e.g. typescript, tailwind, src directory, etc...) which are not
actually mandatory/recommended for the use of the open-next Cloudflare adapter
