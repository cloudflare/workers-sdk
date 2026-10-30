---
"wrangler": patch
---

Deploy the requested directory when `wrangler pages deploy <directory>` is run as a Workers static-assets deploy

When `wrangler pages deploy <directory>` was carried out as a Workers static-assets deploy, the `<directory>` argument was only used to check for unsupported Pages features and was then dropped. Autoconfig detected an assets directory of its own instead, and when the project root contained an `index.html` it chose the whole project root, even when a narrower directory such as `public` had been requested. Files outside the requested directory, such as `.env`, `.dev.vars`, `.git` and `node_modules`, could then be uploaded as public static assets.

The requested directory is now passed through. For an unconfigured project, autoconfig configures it as a static-assets deploy, even when framework dependencies are present. Existing framework-managed deployments, such as projects configured through the Cloudflare Vite plugin alone, keep their existing configuration and scripts. When no Wrangler config exists after autoconfig, the requested directory and a default compatibility date are supplied for this deploy without writing a config; an explicit compatibility date takes precedence. For a project that already has a Workers config, the directory is passed as `--assets`, or `--site` for legacy Workers Sites, overriding the configured directory. A requested directory that does not exist now fails before any files are written and reports the delegation failure to the agent.
