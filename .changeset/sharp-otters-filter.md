---
"@cloudflare/autoconfig": minor
"@cloudflare/build-output-utils": minor
"@cloudflare/workers-utils": minor
---

Share scaffolded asset ignore patterns and support fallback filtering for static Build Output.

Consumers can pass the scaffolded rules as fallback patterns to `createAssetsCopyFilter` and supply the resulting filter to `writeAssets`. Fallbacks apply only when `.assetsignore` is missing, and `writeAssets` can report skipped entries through `onSkip` without modifying the source tree.
