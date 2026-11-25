---
"@cloudflare/autoconfig": patch
"@cloudflare/build-output-utils": patch
"@cloudflare/cli-shared-helpers": patch
"miniflare": patch
"wrangler": patch
---

Create missing project files and install their tooling when autoconfig generates `cloudflare.config.ts`.

Projects get a local manifest and TypeScript config where needed, along with default `cf dev` and `cf build` scripts when those scripts are missing. Interactive setup asks before creating these files; CI accepts the additions without prompting. Existing dev and build scripts, compiler settings, and the project's choice of build tool are preserved. Autoconfig reports when an explicit CommonJS package setting prevents it from writing a usable `cloudflare.config.ts`.

For static sites that serve the project root, autoconfig excludes the new configuration and package-manager files from assets. Wrangler skips `node_modules` and `.cloudflare` when watching the root for asset changes, and both build output and local dev skip traversing directories excluded by `.assetsignore`.
