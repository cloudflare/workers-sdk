---
"@cloudflare/pages-shared": minor
---

fix: remove extension name check when generating response

Current regex logic to check whether a pathname is a file (has file extension) is causing trouble for some websites, and now \${pathname}/index.html is always checked before returning notFound().
