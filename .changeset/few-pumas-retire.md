---
"wrangler": minor
---

Added support for `wrangler init` test generation and TypeScript.
The `--yes` flag now generates a test for the project using Jest and Jest types during initialization.
Test generation is also now prompted for during the generation of a TypeScript project.

This resolves issue #2436.
