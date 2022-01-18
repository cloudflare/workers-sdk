---
"wrangler": patch
---

fix: correctly handle entry-point path when publishing

The `publish` command was failing when the entry-point was specified in the wrangler.toml file and the entry-point imported another file.

This was because we were using the `metafile.inputs` to guess the entry-point file path. But the order in which the source-files were added to this object was not well defined, and so we could end up failing to find a match.

This fix avoids this by using the fact that the `metadata.outputs` object will only contain one element that has the `entrypoint` property - and then using that as the entry-point path. For runtime safety, we now assert that there cannot be zero or multiple such elements.
