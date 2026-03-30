---
"wrangler": patch
---

Improve error message when the assets directory path points to a file instead of a directory

Previously, if the path provided as the assets directory (via `--assets` flag or `assets.directory` config) pointed to an existing file rather than a directory, Wrangler would throw an unhelpful `ENOTDIR` system error when trying to read the `_redirects` file inside it. Now Wrangler detects this condition earlier and throws a clear user error.
