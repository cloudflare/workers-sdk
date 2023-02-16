---
"@cloudflare/pages-shared": minor
"wrangler": minor
---

Feat: Pages now supports Proxying (200 status) redirects in it's \_redirects file

This will look something like the following, where a request to /users/123 will appear as that in the browser, but will internally go to /users/[id].html.

```
/users/:id /users/[id] 200
```
