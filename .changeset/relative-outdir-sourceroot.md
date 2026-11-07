---
"wrangler": patch
---

Stop writing a relative `sourceRoot` into source maps written to `--outdir`

Source maps written by `wrangler deploy --outdir <dir>` and `wrangler versions upload --outdir <dir>` had `sourceRoot` set to `<dir>` as given on the command line, usually relative to the working directory. The source map spec resolves `sourceRoot` relative to the map itself, so tools that follow it looked for sources under `<dir>/<dir>/...`. These maps no longer have a `sourceRoot`; their `sources` were already relative to the map. Source maps uploaded to Cloudflare are unchanged apart from the empty `sourceRoot` field, and `wrangler dev` is unaffected.
