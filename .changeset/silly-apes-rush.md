---
"wrangler": patch
---

chore: add eslint-plugin-import

- This adds `eslint-plugin-import` to enforce ordering of imports, and configuration for the same in `package.json`.
- I also run `npm run check:lint -- --fix` to apply the configured order in our whole codebase.
- This also needs a setting in `.vscode/settings.json` to prevent spurious warnings inside vscode. You'll probably have to restart your IDE for this to take effect. (re: https://github.com/import-js/eslint-plugin-import/issues/2377#issuecomment-1024800026)

(I'd also like to enforce using `node:` prefixes for node builtin modules, but that can happen later. For now I manually added the prefixes wherever they were missing. It's not functionally any different, but imo it helps the visual grouping.)
