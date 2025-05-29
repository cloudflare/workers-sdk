---
"wrangler": patch
---

expose new utilities and types to aid consumers of the programmatic mixed-mode API

Specifically the exports have been added:

- `Experimental_MixedModeSession`: type representing a mixed-mode session

- `Experimental_ConfigBindingsOptions`: type representing config-bindings

- `experimental_pickRemoteBindings`: utility for picking only the remote bindings from a record of start-worker bindings.

- `unstable_convertConfigBindingsToStartWorkerBindings`: utility for converting config-bindings into start-worker bindings (that can be passed to `startMixedModeSession`)
