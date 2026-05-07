---
"wrangler": patch
---

Bump bundled `execa` from `^6.1.0` to `^9.5.3` to silence Node 24 `DEP0190` deprecation warning

Under Node 24, every `wrangler` invocation that shells out (e.g. `wrangler deploy`, `wrangler init`, package-manager detection) emits:

```
(node:NNNN) [DEP0190] DeprecationWarning: Passing args to a child process with shell option true can lead to security vulnerabilities, as the arguments are not escaped, only concatenated.
```

The warning originates from the bundled `execa` inside `wrangler-dist/cli.js`. `execa@6.1.0` is the highest 6.x ever published and predates the fix; the fix landed in `execa@9.5.3` ([sindresorhus/execa#1199](https://github.com/sindresorhus/execa/pull/1199)). Bumping to `^9.5.3` resolves the warning. All call sites in `wrangler` (`init.ts`, `package-manager.ts`, `deployment-bundle/run-custom-build.ts`) use APIs that are stable across the 6 → 9 transition.
