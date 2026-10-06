---
"wrangler": patch
---

Allow Artifacts repository event subscriptions to specify a namespace and repository name

The API requires both fields for `artifacts.repo` subscriptions, but Wrangler previously sent neither. Pass `--namespace` and `--repo-name` when creating one, and use short event names such as `pushed` with `--events`.
