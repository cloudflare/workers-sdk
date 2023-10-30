---
"create-cloudflare": patch
---

Only commit the changes if the repository was generated (directly or not) by C3

(This follows what CLI tools seems to generally do, avoids weird corner case
behaviors users might have for example when running C3 inside monorepos and avoids commits
when people don't want or expect them)
