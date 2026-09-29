---
"@cloudflare/codemods": minor
---

Migrate Workflow bindings in `cf migrate`

The `wrangler-to-cf` codemod previously reported every `workflows` entry as unsupported and left it out of `cloudflare.config.ts`, so a migrated Worker lost its Workflow bindings. It now converts each entry to `bindings.workflow({ name, worker, exportName })`. A Workflow the Worker defines itself (no `script_name`, or a `script_name` naming this Worker) also gets an `exports.workflow` entry carrying its `limits`, `concurrency`, `schedules` and `default_retention`. When the Wrangler `exports` table already declares the same Workflow, the binding's settings merge into that declaration, as Wrangler merges them. A second Workflow on an already exported class keeps its binding, and its settings are reported, since the new config declares one Workflow per exported class. A Workflow bound from another Worker keeps only its binding, and any settings on it are reported for manual migration. An entry with no `class_name` gets a `workflow-missing-class` follow-up.

Workflow exports now write `default_retention` as `defaultRetention`, with `successRetention` and `errorRetention` inside it. The snake_case keys the codemod emitted before made `cloudflare.config.ts` fail validation with "Invalid input".

This changes the output of the `wrangler-to-cf` migration behind `cf migrate`, which is in beta.
