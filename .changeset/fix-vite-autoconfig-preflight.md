---
"@cloudflare/autoconfig": patch
---

Configure Vite projects that omit the `plugins` array

Autoconfiguration now adds the Cloudflare plugin to supported Vite configs without a `plugins` property. If the config cannot be rewritten safely, setup stops before installing dependencies or changing project files.
