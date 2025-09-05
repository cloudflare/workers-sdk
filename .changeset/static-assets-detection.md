---
"wrangler": minor
---

Improve error messaging when no entry point is found by detecting potential static asset directories

When `wrangler deploy` fails due to missing entry points, Wrangler now automatically detects common static asset directories (like `dist`, `build`, `public`, etc.) and framework-specific output directories (like Astro, Vite, Next.js, Eleventy). The error message now includes helpful suggestions about which directories might contain static assets and provides the exact command to deploy them with `--assets`.

This feature helps new users better understand what they need to do when deploying static sites to Cloudflare without requiring them to understand Wrangler configuration files.