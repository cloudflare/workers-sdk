---
"wrangler": patch
---

Deploy the requested directory when `wrangler pages deploy <directory>` is run as a Workers static-assets deploy

When `wrangler pages deploy <directory>` was carried out as a Workers static-assets deploy, the `<directory>` argument was only used to check for unsupported Pages features and was then dropped. Autoconfig detected an assets directory of its own instead, and when the project root contained an `index.html` it chose the whole project root, even when a narrower directory such as `public` had been requested. Files outside the requested directory, such as `.env`, `.dev.vars`, `.git` and `node_modules`, could then be uploaded as public static assets.

The requested directory is now passed through. For a static project without a Workers config, autoconfig uses it as the assets directory in the generated Wrangler configuration and the deploy. For a project that already has a Workers config, it is passed as `--assets`, which takes precedence over the configured assets directory. A requested directory that does not exist now fails before any files are written.
