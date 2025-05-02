---
"wrangler": patch
---

make that `unstable_startWorker` can correctly throw configuration errors

make sure that `unstable_startWorker` can throw configuration related errors when:

- the utility is called
- the worker's `setConfig` is called with the `throwErrors` argument set to `true`

additionally when an error is thrown when `unstable_startWorker` is called make sure
that the worker is properly disposed (since, given the fact that it is not returned
by the utility the utility's caller wouldn't have any way to dispose it themselves)
