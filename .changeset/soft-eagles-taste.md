---
"wrangler": patch
---

feat: with `wrangler init`, create a new directory for named workers

Currently, when creating a new project, we usually first have to create a directory before running `wrangler init`, since it defaults to creating the `wrangler.toml`, `package.json`, etc in the current working directory. This fix introduces an enhancement, where using the `wrangler init [name]` form creates a directory named `[name]` and initialises the project files inside it. This matches the usage pattern a little better, and still preserves the older behaviour when we're creating a worker inside existing projects.
