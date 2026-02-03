---
"@cloudflare/vite-plugin": patch
---

Avoid collecting `nodejs_compat` warnings during dependency optimization.

Previously, a custom plugin was provided during dependency optimization to collect warnings when Node.js built-ins were imported and the `nodejs_compat` flag was not enabled.
Because optimized dependencies are cached, the warning was only displayed when dependencies changed.
Additionally, it sometimes included false positives from dependencies that were no longer used.
We now always externalize Node.js built-ins during dependency optimization and collect the warnings at runtime.
This is more consistent with how warnings are collected for direct imports of Node.js built-ins.
