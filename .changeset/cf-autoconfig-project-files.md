---
"@cloudflare/autoconfig": minor
"@cloudflare/build-output-utils": patch
"@cloudflare/cli-shared-helpers": patch
"miniflare": patch
"wrangler": patch
---

Create missing project files and install their tooling when autoconfig generates `cloudflare.config.ts`.

Projects get a local manifest and TypeScript config where needed, along with default `cf dev` and `cf build` scripts when those scripts are missing. Interactive setup asks before creating these files; non-interactive runs, such as CI, accept the additions without prompting. Existing scripts, compiler settings, and the project's choice of build tool are preserved, including Vite runners declared at the workspace root. New manifests set `"type": "module"` so Node loads `cloudflare.config.ts` without a module-type warning. Existing manifests keep their module type. Autoconfig reports when an explicit CommonJS package setting prevents it from writing a usable `cloudflare.config.ts`.

For static sites that serve the project root, autoconfig adds `node_modules`, `.cloudflare`, and the new configuration and package-manager files to `.assetsignore`. Wrangler's asset watcher, local asset serving, and build output skip directories according to those rules, which you can edit to include paths you want to serve. Local dev still follows directory symlinks, but skips links that would revisit an ancestor directory.

Builds do not support broken asset symlinks. A missing target fails the build unless `.assetsignore` excludes the link regardless of whether it points to a file or a directory.
