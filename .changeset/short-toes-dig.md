---
"wrangler": minor
---

Add interactive data catalog validation to R2 object and lifecycle commands.

When performing R2 operations that could affect data catalog state (object put, object delete, lifecycle add, lifecycle set), Wrangler now validates with the API and prompts users for confirmation if a conflict is detected. For bulk put operations, Wrangler prompts upfront before starting the batch. Users can bypass prompts with `--force` (`-y`). In non-interactive/CI environments, the operation proceeds automatically.
