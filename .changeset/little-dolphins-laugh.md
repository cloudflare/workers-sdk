---
"wrangler": patch
---

fix: improve error message if custom build output is not found

The message you get if Wrangler cannot find the output from the custom build is now more helpful.
It will even look around to see if there is a suitable file nearby and make suggestions about what should be put in the `main` configuration.

Closes [#946](https://github.com/cloudflare/wrangler2/issues/946)
