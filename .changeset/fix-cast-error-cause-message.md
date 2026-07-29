---
"wrangler": patch
---

Surface the original error message, name and stack when the dev server reports an internal error

Errors reported by the ProxyWorker cross a JSON channel, so they arrived as plain objects and were previously wrapped in a message-less `Error`, causing `wrangler dev` to exit with an empty `✘ [ERROR]` log. Such errors (e.g. `Network connection lost.`, see #14641) are now rehydrated with their original message, name and stack so the failure is actually diagnosable.
