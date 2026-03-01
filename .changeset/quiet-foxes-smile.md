---
"wrangler": minor
---

Add support for ignoring `.env` files with `# WRANGLER_IGNORE` comment

When a `.env` file contains a line with `# WRANGLER_IGNORE`, Wrangler will skip loading that file. This is useful when you have `.env` files managed by other tools (such as Vite) that shouldn't be loaded by Wrangler.

Example `.env` file that will be ignored:

```
# WRANGLER_IGNORE
DATABASE_URL=postgresql://...
API_KEY=secret
```

The comment can appear anywhere in the file and Wrangler will log a debug message when a file is ignored. This applies to `.env`, `.env.local`, `.env.<environment>`, and `.env.<environment>.local` files.
