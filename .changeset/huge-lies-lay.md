---
"wrangler": patch
---

fix: make sure that the experimental `remoteBindings` flag is properly handled in `getPlatformProxy`

There are two issues related to how the experimental `remoteBindings` flag is handled in `getPlatformProxy` that are being fixed by this change:

- the `experimental_remote` configuration flag set on service bindings is incorrectly always taken into account, even if `remoteBindings` is set to `false`
- the `experimental_remote` configuration flag of all the other bindings is never taken into account (effectively preventing the bindings to be used in remote mode) since the `remoteBindings` flag is not being properly propagated
