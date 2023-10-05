---
"create-cloudflare": patch
---

.gitignore files were not included in our templates due to npm/npm#3763

we now workaround this issue and ensure C3 templates include a .gitignore file
