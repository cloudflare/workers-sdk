---
"miniflare": patch
---

Name only the Workflow in the error for a second introspection session

For a Workflow declared in `exports`, the error said the session was "for binding" the Workflow's class. It now reads `Workflow "my-workflow" already has an active introspection session.`
