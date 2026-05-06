---
"wrangler": patch
---

fix: reduce Sentry noise by classifying user-environment errors correctly

Converted common user-environment failures (missing build outputs, expired tokens, transient network issues, C3 process exits, invalid API tokens, missing assets directories, framework version detection, container SSH, D1 export limitations, and inline source maps) to `UserError` so they are no longer reported as crashes in Sentry. Also tightened top-level error filtering to recognise duck-typed `UserError`, `MiniflareError.isUserError()`, a broader set of authentication errors, transient network errors, and filesystem environment errors.
