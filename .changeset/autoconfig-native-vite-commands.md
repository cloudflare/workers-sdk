---
"@cloudflare/autoconfig": minor
"wrangler": patch
---

Return native Vite commands for experimental cf projects without detected framework commands

Autoconfig now resolves the project's installed Vite or Vite+ executable when a project declares the Cloudflare Vite plugin and no framework dev or build command is available. The existing command fields include the native executable and subcommand, letting cf execute them without a plugin-owned delegate. This retains plugin v2 compatibility checks and provides install guidance for missing project tools. Wrangler's command selection is unchanged.
