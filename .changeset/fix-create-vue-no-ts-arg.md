---
"create-cloudflare": patch
---

Fix Vue project scaffolding failing with `ERR_PARSE_ARGS_UNKNOWN_OPTION` for `--no-ts`

`create-vue` switched to Node's `parseArgs` with strict mode, which does not support `--no-*` negation syntax. The `--no-ts` flag is no longer passed; instead, the `--ts` flag is only included when TypeScript is selected.
