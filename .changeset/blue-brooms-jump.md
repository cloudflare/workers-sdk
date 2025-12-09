---
"create-cloudflare": minor
---

Support `<PACKAGE_NAME>` as a placeholder for the package name in `package.json`

`"name": "<PACKAGE_NAME>"` is replaced with the project name when c3 updates a `package.json` using `updatePackageName`.
Previously only `"<TBD>"`, `"TBD"`, and `""` were supported placeholder names.
