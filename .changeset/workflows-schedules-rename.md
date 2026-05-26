---
"wrangler": patch
---

Rename Workflow binding `schedule` property to `schedules`

The `schedule` property on Workflow bindings introduced in [#13467](https://github.com/cloudflare/workers-sdk/pull/13467) has been renamed to `schedules` to match the control plane API.

> **Note:** This remains a configuration-only change. Scheduled triggering of Workflow instances is not yet available — adding `schedules` to a Workflow binding will not result in scheduled invocations at this time.
