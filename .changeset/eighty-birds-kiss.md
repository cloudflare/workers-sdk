---
"@cloudflare/pages-shared": patch
---

fix: fix Pages redirects going to a hash location to be duped. This means if you have a rule like `/foo/bar /foo#bar` it will no longer result in `/foo#bar#bar` but the correct `/foo#bar`.
