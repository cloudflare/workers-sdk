---
"wrangler": minor
---

Support bulk deletes for Pages deployments

`wrangler pages deployment delete` now accepts multiple deployment IDs in one command. When more than one deployment is provided, Wrangler asks for a short generated confirmation code before deleting the deployments, while `--force` keeps the command scriptable.
