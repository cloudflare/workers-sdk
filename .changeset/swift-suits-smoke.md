---
"wrangler": patch
---

fix: check for the correct inspector port in local dev

Previously, the `useLocalWorker()` hook was being passed the wrong port for the `inspectorPort` prop.

Once this was fixed, it became apparent that we were waiting for the port to become free in the wrong place, since this port is already being listened to in `useInspector()` by the time we were starting the check.

Now, the check to see if the inspector port is free is done in `useInspector()`,
which also means that `Remote` benefits from this check too.
