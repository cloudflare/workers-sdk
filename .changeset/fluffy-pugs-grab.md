---
"wrangler": patch
---

fix: do not delete previously defined plain_text/json bindings on publish

Currently, when we publish a worker, we delete an pre-existing bindings if they're not otherwise defined in `wrangler.toml`, and overwrite existing ones. But folks may be deploying with wrangler, and changing environment variables on the fly (like marketing messages, etc). It's annoying when deploying via wrangler blows away those values.

This patch fixes one of those issues. It will not delete any older bindings that are not in wrangler.toml. It still _does_ overwrite existing vars, but at least this gives a way for developers to have some vars that are not blown away on every publish.
