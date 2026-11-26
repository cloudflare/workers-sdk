---
"@cloudflare/autoconfig": patch
---

Fix Angular SPA asset directory detection for the application builder

Angular SPAs using the application builder now configure Workers assets from the nested browser output directory instead of its parent. Custom `outputPath` values are respected, while legacy browser builder paths remain unchanged.
