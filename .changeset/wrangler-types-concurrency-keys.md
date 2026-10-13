---
"wrangler": minor
---

Type Workflow step concurrency keys in `wrangler types`

A step that references a misspelled concurrency key runs without its limit. When the Worker defines a Workflow and the configuration sets `account_id`, `wrangler types` now lists that account's concurrency keys into a delimited section of `worker-configuration.d.ts`, narrowing `step.do`'s `concurrency` option to those names so `tsc` catches the typo.

The lookup never prompts for login. Without credentials, or when it fails, the previously generated key names are kept. The section is not part of the `--check` hash, and `wrangler dev` regeneration carries it over without fetching. Pass `--concurrency-keys=false` to skip it.
