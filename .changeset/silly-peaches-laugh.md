---
"miniflare": minor
"wrangler": minor
---

Add local Stream binding support in Miniflare and Wrangler dev

Miniflare now implements a local Stream binding with direct upload flows and Stream-specific handler routing so Stream APIs can be exercised during local development. Wrangler dev forwards Stream binding configuration to Miniflare, including remote/local behavior, so local mode works with the same binding shape used in deployed workers.
