---
"create-cloudflare": patch
---

Fix TypeScript detection for web framework templates. Previously, C3 would incorrectly default to JavaScript for web framework templates with a `generate` function, even when the framework generated a TypeScript project. Now, C3 correctly detects TypeScript by checking for `tsconfig.json` after the framework's generate function runs.
