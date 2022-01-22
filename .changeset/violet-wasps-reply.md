---
"wrangler": patch
---

fix: skip unwanted files and directories when publishing site assets

In keeping with Wrangler 1, we now skip node_modules and hidden files and directories.

An exception is made for `.well-known`. See https://datatracker.ietf.org/doc/html/rfc8615.

The tests also prove that the asset uploader will walk directories in general.
