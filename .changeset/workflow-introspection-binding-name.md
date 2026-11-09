---
"miniflare": patch
---

Name the binding used in Workflow introspection errors

All bindings to one Workflow share its binding service, so introspection errors such as "already has an active introspection session" named whatever that service was created for: the Workflow's class when it was declared in `exports`, or one of its bindings otherwise. Each binding now passes its own name to that service.
