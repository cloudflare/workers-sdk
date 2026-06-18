---
"wrangler": patch
---

Module rules with `fallthrough: false` no longer error on files that match only the removed default rule

When a user defined a module rule with `fallthrough: false` (e.g. `{ type: "Text", globs: ["**/*.specific.html"], fallthrough: false }`), any file that matched only the corresponding _default_ rule (e.g. the default `**/*.html` Text rule) would throw a confusing error about a rule not being marked `fallthrough = true`. Setting `fallthrough: false` is an explicit signal that the user's rule is the final rule for that type, so files matching only the shadowed default rules are now silently skipped instead of erroring. A user's own subsequent rule of the same type that is shadowed still warns/errors as before.
