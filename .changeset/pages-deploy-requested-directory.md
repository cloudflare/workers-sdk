---
"wrangler": patch
---

Deploy the requested directory when `wrangler pages deploy <directory>` is run as a Workers static-assets deploy

When `wrangler pages deploy <directory>` was carried out as a Workers static-assets deploy, the `<directory>` argument was only used to check for unsupported Pages features and was then dropped. Autoconfig detected an assets directory of its own instead, and when the project root contained an `index.html` it chose the whole project root, even when a narrower directory such as `public` had been requested. Source files and configuration outside the requested directory that were not excluded by `.assetsignore` could then be uploaded as public static assets.

The requested directory is now validated before files are written and passed through to the deploy. Unconfigured projects are set up for static assets even when framework dependencies are present; existing Workers configs receive an `--assets` or legacy `--site` override. Projects configured through the Cloudflare Vite plugin alone keep their configuration and scripts, using the requested directory and an explicit or default compatibility date just for this deploy. Successful deployments without a config file are recorded in the project's `.wrangler/deployments` directory for that account and Worker, surviving dependency reinstalls. Repeat deploys verify the recorded version still belongs to the target Worker before allowing an update, preserving protection against name collisions and replacements.
