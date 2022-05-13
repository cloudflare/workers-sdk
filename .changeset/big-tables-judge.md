---
"wrangler": patch
---

fix: add warning to `fetch()` calls that will change the requested port

In Workers published to the Edge (rather than previews) there is a bug where a custom port on a downstream fetch request is ignored, defaulting to the standard port.
For example, `https://my.example.com:668` will actually send the request to `https://my.example.com:443`.

This does not happen when using `wrangler dev` (both in remote and local mode), but to ensure that developers are aware of it this change displays a runtime warning in the console when the bug is hit.

Closes #1320
