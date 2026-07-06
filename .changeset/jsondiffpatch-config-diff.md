---
"wrangler": patch
---

Replace `json-diff` with `jsondiffpatch` for computing config diffs

The `json-diff` dependency used to diff local and remote Worker configuration is CJS-only and unmaintained. It has been replaced with the actively maintained, ESM-compatible `jsondiffpatch`. The diff shown when your local configuration differs from the remote configuration is now rendered by a compact, changed-only formatter; the changes it reports are unchanged, but the exact layout and the ordering of fields may differ slightly.
