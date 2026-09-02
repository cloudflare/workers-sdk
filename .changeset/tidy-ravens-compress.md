---
"wrangler": minor
---

Support gzip compression for JSON Pipelines sinks

Pipelines is in open beta. `wrangler pipelines sinks create` and the interactive setup flow now pass the selected JSON compression to the Pipelines API. JSON sinks accept `uncompressed` or `gzip`, while Parquet retains its existing compression options and `zstd` default.
