---
"wrangler": patch
---

maintenance: bundle miniflare

This bundles miniflare into the wrangler package. We already bundled most other dependencies, this adds miniflare as well. Of note, it's actually bundling miniflare _twice_, once into the main bundle, and once separately as a cli to be called with `wrangler dev` as local mode. We could optimise this in the future as a separate package. Regardless, I expect this to anyway install fewer dependencies (naturally, because it's not a nested dep anymore) and roughly be the same size for download, so it should be a faster install.
