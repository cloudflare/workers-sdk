---
"create-cloudflare": patch
---

Fix Cloudflare bindings being unavailable during `nuxt dev` in pnpm projects created from the Nuxt template

The Nuxt (Workers) template explicitly installs `h3` when using pnpm, so that the `H3EventContext` type augmentation in `env.d.ts` can resolve the `h3` module under pnpm's isolated `node_modules` layout. Since h3's `latest` npm dist-tag moved to the 2.x release candidates, this installed `h3@2.0.1-rc.x` alongside the `h3@1.x` that Nuxt/Nitro run on. Nitro's auto-import layer then resolved `getRequestURL` from h3 v2, which throws when called with an h3 v1 event inside the `nitro-cloudflare-dev` request hook. Nitro swallows request-hook errors, so the hook silently failed before assigning `event.context.cloudflare`, and any server route accessing bindings crashed with "Cannot read properties of undefined (reading 'env')".

The template now installs `h3@^1`, matching the h3 major that nitropack depends on.
