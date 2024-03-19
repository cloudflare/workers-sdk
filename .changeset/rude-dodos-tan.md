---
"miniflare": minor
---

feature: differentiate address-in-use errors

Previously, Miniflare would throw a generic `ERR_RUNTIME_FAILURE` error when starting on an address that already in use. This change updates the `code` to `ERR_ADDRESS_IN_USE` in this case. No errors are thrown when starting multiple `workerd` instances with the same port on Windows due to [this issue](https://github.com/cloudflare/workerd/issues/1664).

If an `ERR_ADDRESS_IN_USE` error is thrown when constructing a `new Miniflare()` instance, and the `unsafeRetryPortAllocation: true` option is set, Miniflare will restart `workerd` with a new random port.
