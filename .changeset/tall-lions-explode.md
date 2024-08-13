---
"wrangler": minor
---

feat: allow HTTPS custom certificate paths to be provided by a environment variables

As well as providing paths to custom HTTPS certificate files, it is now possible to use WRANGLER_HTTPS_KEY_PATH and WRANGLER_HTTPS_CERT_PATH environment variables.

Specifying the file paths at the command line overrides specifying in environment variables.

Fixes #5997
