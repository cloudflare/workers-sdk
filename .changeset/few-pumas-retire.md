---
"wrangler": minor
---

Added support for `wrangler init` test generation and TypeScript.
The `--yes` flag now generates a test for the project using Jest and Jest types during initialization.
When creating a TypeScript project, the user will be prompted to generate tests with Vitest, which supports TypeScript natively.
This feature allows users to easily set up a testing environment for their project during the initialization process, when using the `--yes`
flag it will default to Vitest for the TypeScript project.

This resolves issue #2436.
