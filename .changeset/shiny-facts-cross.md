---
"create-cloudflare": patch
---

remove unnecessary ASSETS binding call in SPA templates

With SPA mode now enabled by default for compat dates since 2025-04-01, the Workers in the React and Vue templates no longer need this fallback ASSETS binding.
