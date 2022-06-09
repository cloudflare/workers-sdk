---
"wrangler": patch
---

fix: do not crash when not logged in and switching to remote dev mode

Previously, if you are not logged in when running `wrangler dev` it will only try to log you in
if you start in "remote" mode. In "local" mode there is no need to be logged in, so it doesn't
bother to try to login, and then will crash if you switch to "remote" mode interactively.

The problem was that we were only attempting to login once before creating the `<Remote>` component.
Now this logic has been moved into a `useEffect()` inside `<Remote>` so that it will be run whether
starting in "remote" or transitioning to "remote" from "local".

The fact that the check is no longer done before creating the components is proven by removing the
`mockAccountId()` and `mockApiToken()` calls from the `dev.test.ts` files.

Fixes [#18](https://github.com/cloudflare/wrangler2/issues/18)
