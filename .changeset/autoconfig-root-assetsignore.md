---
"@cloudflare/autoconfig": patch
"wrangler": patch
---

Write a protective `.assetsignore` when autoconfig uses the project root as the static assets directory

Autoconfig is meant to write an `.assetsignore` when the project root itself is the assets directory, so that local files are not uploaded as public assets. The check compared the detected output directory, which is relative (`"."`), with the absolute project path, so it never matched and no `.assetsignore` was written. A static project with an `index.html` at its root (for example after `wrangler setup` or a zero-config `wrangler deploy`) then uploaded files such as `.env`, `.dev.vars`, `.git` and `node_modules` as public assets.

The check now resolves the assets directory that the generated configuration uses and compares it with the project root, so frameworks that set their own build output directory (such as Nuxt or SvelteKit) do not get an unused root `.assetsignore`. The generated `.assetsignore` also covers what a Cloudflare Pages upload skips, alongside the existing `.wrangler`, `.dev.vars*` and `.env*` entries: `/_worker.js`, `/_routes.json` and `/functions` at the root (so nested paths such as `blog/functions/index.html` are still uploaded), `node_modules`, `.git` and `.DS_Store` at any depth, and `.npmrc`. If an existing `.assetsignore` only lists a narrower pattern such as `.env`, `.env*` is added so that files like `.env.production` are skipped too. When the project root of an assets-only project contains a Pages `functions` directory or `_worker.js`, autoconfig now warns that it will not be deployed, since it is excluded from the assets and not run as server code.
