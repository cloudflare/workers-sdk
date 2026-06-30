---
"miniflare": minor
"wrangler": minor
"@cloudflare/vite-plugin": minor
---

Experimental: add an opt-in switch for local-dev observability

Setting `X_LOCAL_OBSERVABILITY=true` (read by both `wrangler dev` and the Vite plugin — there is no separate CLI flag or plugin option) turns on a single `unsafeObservability` Miniflare option. When set, Miniflare core attaches an internal trace collector as a streaming-tail consumer of each of your worker(s) and adds the compatibility flags workerd needs to emit that tail — wired in one place rather than duplicated across the dev tools. It defaults to off while experimental. This first step wires the collector in (it's a placeholder for now); capturing and surfacing the traces lands in follow-up changes.
