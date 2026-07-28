---
"create-cloudflare": patch
---

Fix the `hello-world-workflows` JavaScript template crashing at runtime

`MyWorkflow` defined a constructor that assigned to `this` without calling `super()` first, so instantiating the Workflow threw `ReferenceError: Must call super constructor in derived class before accessing 'this'`. The constructor also took `(env)` where `WorkflowEntrypoint` is constructed with `(ctx, env)`. It was redundant in the first place — the base class already assigns `this.env` — so it has been removed, matching the TypeScript variant of the same template.
