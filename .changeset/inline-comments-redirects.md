---
"@cloudflare/workers-shared": minor
---

Add support for inline comments in `_redirects` files

You can now add inline comments to redirect rules using the `#` character:

```
/old-page /new-page 301 # Moved during site redesign
/blog/* /articles/:splat # Blog URL migration
```

This improves the maintainability of `_redirects` files by allowing documentation of complex redirect rules directly alongside the rules themselves. Full-line comments (lines starting with `#`) continue to work as before. URL fragments (e.g., `/page#section`) are preserved correctly.
