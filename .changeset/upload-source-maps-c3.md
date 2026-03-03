---
"create-cloudflare": minor
---

Enable `upload_source_maps` by default for new projects

All new projects created with C3 now have `upload_source_maps` set to `true` in their Wrangler configuration. This means source maps are automatically uploaded when you deploy, giving you meaningful stack traces in your Worker's logs and error reports without any extra setup.
