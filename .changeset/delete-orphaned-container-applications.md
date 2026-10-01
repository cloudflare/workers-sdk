---
"wrangler": minor
---

Warn about and offer to delete Container applications when running `wrangler delete`

`wrangler deploy` creates a Containers application for each Durable Object-backed Container, but `wrangler delete` only removed the Worker. The applications survived with their instances still running and billing, with nothing in the Worker's own listing to reveal them.

`wrangler delete` now resolves the Container applications the Worker owns from its Durable Object namespaces before deleting it, and then offers to delete them too. When the command cannot prompt — CI, or a non-interactive terminal — it prints the leftover applications with the `wrangler containers delete <id>` command for each, rather than leaving them to be discovered elsewhere. The lookup only reaches the Containers API for Workers that actually have Durable Objects, and a failed lookup is reported but never fails the delete.