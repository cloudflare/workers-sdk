---
"wrangler": patch
---

Check `npm_config_user_agent` to guess a user's package manager

The environment variable `npm_config_user_agent` can be used to guess the package manager
that was used to execute wrangler. It's imperfect (just like regular user agent sniffing!)
but the package managers we support all set this property:

- [npm](https://github.com/npm/cli/blob/1415b4bdeeaabb6e0ba12b6b1b0cc56502bd64ab/lib/utils/config/definitions.js#L1945-L1979)
- [pnpm](https://github.com/pnpm/pnpm/blob/cd4f9341e966eb8b411462b48ff0c0612e0a51a7/packages/plugin-commands-script-runners/src/makeEnv.ts#L14)
- [yarn](https://yarnpkg.com/advanced/lifecycle-scripts#environment-variables)
- [yarn classic](https://github.com/yarnpkg/yarn/pull/4330)
