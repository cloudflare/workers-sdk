---
"wrangler": patch
---

Fix `wrangler dev` hanging on shutdown when remote bindings are present

startDev() registers dev hotkeys before authenticating the user. During interactive dev sessions, the auth callback re-registers hotkeys, which updates the local unregisterHotKeys variable to a new cleanup function. However, the unregisterHotKeys value returned to callers was captured as a direct reference to the initial registration, so it would call the stale cleanup function instead of the current one.

This has been fixed by returning a wrapper function () => unregisterHotKeys?.() instead of the variable directly. The wrapper evaluates unregisterHotKeys at call time, ensuring it always invokes the latest cleanup function even after re-registration.
