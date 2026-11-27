---
"@cloudflare/autoconfig": patch
---

Install everything a cf project needs in one run, in the project's own package

Setting a project up for cf now installs cf, the Cloudflare Vite plugin, Wrangler and the framework's packages together, after the framework's changes. It skips packages the project already has, keeps a Vite plugin version the project manages itself (such as `catalog:`), and lists anything it couldn't install as follow-up work instead of failing.
