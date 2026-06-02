---
"wrangler": patch
---

Skip stale bundles during dev server reload to avoid redundant restarts

When rapidly saving a wrangler config file with remote bindings, each save would trigger a full reload cycle (remote connection setup, miniflare restart), causing many sequential "Reloading local server... / Establishing remote connection..." messages (while blocking the user). The runtime controllers now check whether a newer bundle has been queued at each expensive async boundary and bail out early if the current bundle is stale. This ensures that only the latest config change triggers a reload, making `wrangler dev` much more responsive during repeated config edits.
