---
"@cloudflare/autoconfig": minor
"@cloudflare/build-output-utils": patch
"@cloudflare/cli-shared-helpers": patch
"miniflare": patch
"wrangler": patch
---

Create missing project files and install their tooling when autoconfig generates `cloudflare.config.ts`.

Projects get a local manifest and TypeScript config where needed, along with default `cf dev` and `cf build` scripts when those scripts are missing. Interactive setup asks before creating these files; CI accepts the additions without prompting. Existing scripts, compiler settings, and the project's choice of build tool are preserved, including Vite runners declared at the workspace root. New manifests leave the module type unset so existing CommonJS scripts keep working. Autoconfig reports when an explicit CommonJS package setting prevents it from writing a usable `cloudflare.config.ts`.

For static sites that serve the project root, autoconfig excludes the new configuration and package-manager files from assets. Wrangler skips `node_modules` and `.cloudflare` when watching the root for asset changes, and both build output and local dev skip traversing directories excluded by `.assetsignore`. Local dev no longer follows directory symlinks; builds still copy the contents of directory symlinks that are allowed by `.assetsignore`.
