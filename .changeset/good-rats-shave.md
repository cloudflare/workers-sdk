---
"wrangler": patch
---

refactor: simplify and document `config.ts`

This PR cleans up the type definition for the configuration object, as well as commenting the hell out of it. There are no duplicate definitions, and I annotated what I could.

- `@optional` means providing a value isn't mandatory
- `@deprecated` means the field itself isn't necessary anymore in wrangler.toml
- `@breaking` means the deprecation/optionality is a breaking change from wrangler 1
- `@todo` means there's more work to be done (with details attached)
- `@inherited` means the field is copied to all environments
