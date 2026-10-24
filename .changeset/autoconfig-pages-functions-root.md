---
"@cloudflare/autoconfig": patch
"wrangler": patch
---

Stop autoconfig in non-interactive runs when a project root holds both static files and a Pages `functions` directory

When a project without a detected framework has a `functions` directory, autoconfig asks whether it is a Cloudflare Pages project. Non-interactive runs (CI and coding agents) assume it is not and continue as a static site. When the static files are in the project root, that deploys the root as static assets, and the Pages Functions (the project's API routes) are not deployed.

In that case autoconfig now stops with an error explaining that Pages Functions cannot be migrated automatically yet. For Pages Functions it suggests moving the static files into a subdirectory and deploying with `wrangler pages deploy`, or migrating the Functions to a Worker; for a `functions` directory that is not Pages Functions, it suggests moving the static files into a subdirectory or adding a configuration file. Projects whose static files are already in a subdirectory, projects detected as Pages or with a detected framework, and interactive runs where the user answers the prompt are unaffected.
