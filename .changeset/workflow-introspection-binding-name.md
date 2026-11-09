---
"miniflare": patch
---

Name the binding used in Workflow introspection errors

When a Workflow was declared in `exports`, every binding to it shared one binding service, so introspection errors such as "already has an active introspection session" named the Workflow's class instead of the binding. Each binding now passes its own name to that service.
