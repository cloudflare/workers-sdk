---
"wrangler": patch
---

fix: ensure asset keys are relative to the project root

Previously, asset file paths were computed relative to the current working
directory, even if we had used `-c` to run Wrangler on a project in a different
directory to the current one.

Now, assets file paths are computed relative to the "project root", which is
either the directory containing the wrangler.toml or the current working directory
if there is no config specified.
