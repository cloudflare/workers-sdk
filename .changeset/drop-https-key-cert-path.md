---
"miniflare": major
---

Remove the `httpsKeyPath` and `httpsCertPath` options

The `httpsKeyPath` and `httpsCertPath` options have been removed. To use a custom certificate, read the files and pass their contents via the existing `httpsKey` and `httpsCert` options.
