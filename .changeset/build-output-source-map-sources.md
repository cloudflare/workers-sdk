---
"wrangler": minor
---

Write source maps in Build Output with `sources` relative to each source map file

This changes the experimental Build Output that `wrangler build --experimental-cf-build-output` and `cf-wrangler build` write. Their source maps were prepared as if for upload, with `sources` relative to the project root. For Workers that Wrangler does not bundle, leading `../` segments were also removed, which lost the location of some files. They now point from each source map's location in `bundle/` to the original files, like the source maps the Vite plugin writes.
