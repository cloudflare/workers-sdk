---
"wrangler": patch
---

fix: make `wrangler types` always generate a `d.ts` file for module workers

Currently if a config file doesn't define any binding nor module, running
`wrangler types` against such file would not produce a `d.ts` file.

Producing a `d.ts` file can however still be beneficial as it would define a correct
env interface (even if empty) that can be expanded/referenced by user code (this can
be particularly convenient for scaffolding tools that may want to always generate an
env interface).

Example:
Before `wrangler types --env-interface MyEnv` run with an empty `wrangler.toml` file
would not generate any file, after these change it would instead generate a file with
the following content:

```
interface MyEnv {
}
```
