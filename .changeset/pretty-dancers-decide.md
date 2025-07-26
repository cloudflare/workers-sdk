---
"wrangler": patch
---

Add the following dependencies to wrangler: `@iarna/toml`, `chalk`, `cli-table3z`, `dotenv`, `find-up`, `strip-ansi`, `ts-dedent`

These dependencies were `devDependencies` but they are being moves as proper `dependencies` do that third party tool can have the ability to override them when required.
