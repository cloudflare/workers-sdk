---
"create-cloudflare": patch
---

Switch the `react-router` template to scaffold from the upstream `create-react-router` default template and overlay Cloudflare-specific files locally

Previously, C3 invoked `create-react-router` with `--template <pinned GitHub URL>` pointing at a specific commit of `remix-run/react-router-templates/cloudflare`. This pinning was needed because the upstream Cloudflare template had been deleted before, leaving us reliant on a third-party source we don't control.

We now invoke `create-react-router` without `--template` (using the upstream default template) and overlay all Cloudflare-specific files — `workers/app.ts`, `wrangler.jsonc`, split `tsconfig`s, a Cloudflare-flavored `vite.config.ts`, `entry.server.tsx`, etc. — from `templates/react-router/ts/`. A `configure` step deletes `Dockerfile`/`.dockerignore` and the `@react-router/node`/`@react-router/serve` dependencies and `start` script that ship with the default template.

This brings the `react-router` template in line with how `astro`, `svelte`, and `react` already work and removes our dependency on a deleted upstream template. The scaffolded project is functionally equivalent to before.
