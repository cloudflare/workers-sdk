---
"@cloudflare/vitest-pool-workers": patch
---

fix: allow Vite query parameters like `?raw` on `.sql` file imports

Importing `.sql` files with Vite query parameters (e.g., `import sql from "./query.sql?raw"`) would fail with "No such module" errors in vitest-pool-workers 0.12.x. Both import styles now work:

- `import sql from "./query.sql?raw"` (Vite handles the `?raw` transform)
- `import sql from "./query.sql"` (loaded as Text module)
