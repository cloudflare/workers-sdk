---
"create-cloudflare": patch
---

Add a `.gitignore` to the `hello-world-workflows` template

The Workflow template didn't include a `.gitignore`, unlike the other Hello World templates. That meant new projects could end up with `node_modules` and other generated files tracked by git. The template now ships the same `.gitignore` as the other Hello World templates.
