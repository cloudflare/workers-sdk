---
"wrangler": patch
---

Apply application-level container changes even when `rollout_kind` is `"none"`

Previously, setting `rollout_kind: "none"` on a container skipped the application update entirely, so changes to application-level settings such as `max_instances`, `scheduling_policy`, or `constraints` were silently dropped (despite being shown in the deploy diff). Now the application is still updated with those changes; only the rollout is skipped, so existing instances keep running the current version until a rollout is triggered.
