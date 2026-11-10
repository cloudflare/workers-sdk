---
"@cloudflare/autoconfig": minor
"wrangler": patch
---

Return native Vite commands for experimental cf projects without detected framework commands

Autoconfig now resolves the project's installed Vite or Vite+ executable when a project declares the Cloudflare Vite plugin and no framework dev or build command is available. The existing command fields include the native executable and subcommand, letting cf execute them without a plugin-owned delegate. Resolve tools from the application through its detected workspace root, while excluding unrelated parent installs. Report command readiness in `commandError` so callers can inspect projects before installing dependencies and raise errors only at execution. Validate plugin v2 compatibility for all eligible cf Vite-plugin projects and require native Vite configurations to activate `cloudflare()`. Generate shell-compatible Node invocations on Windows, and preserve partial framework command pairs without filling in a command with different framework metadata. Pages detection, Pages Functions migration guards, and unsupported framework configuration retain their existing behavior; already-configured custom Vite projects can use the fallback. Wrangler's command selection is unchanged.
