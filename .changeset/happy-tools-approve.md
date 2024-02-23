---
"wrangler": minor
---

feat: allow preserving file names when defining rules for non-js modules

The developer is now able to specify the `preserve_file_names property in wrangler.toml
which specifies whether Wrangler will preserve the file names additional modules that are
added to the deployment bundle of a Worker.

If not set to true, files will be named using the pattern ${fileHash}-${basename}.
For example, `34de60b44167af5c5a709e62a4e20c4f18c9e3b6-favicon.ico`.

Resolves [#4741](https://github.com/cloudflare/workers-sdk/issues/4741)
