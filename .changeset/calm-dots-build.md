---
"@cloudflare/autoconfig": patch
---

Prevent static-site detection from failing on inaccessible child directories

Autoconfig now checks each candidate directory's `index.html` directly and ignores expected missing-file and permission errors. This allows commands such as `cf build` to run from directories containing protected folders, including a macOS home directory with `.Trash`.
