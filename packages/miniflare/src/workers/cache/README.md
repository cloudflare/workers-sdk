# The Cache API

The Cache API within `workerd` is _extremely_ lenient with errors, and will work
with a service that doesn't fully support the expected API. This is what it
_should_ behave like:

## .add()

Unimplemented in the runtime

## .addAll()

Unimplemented in the runtime

## .match()

`workerd` guarantees:

- The method will always be `GET`
- The request headers will include `Cache-Control: only-if-cached` (which
  Miniflare ignores)
- The request headers will include `Cf-Cache-Namespaces` if this is a namespaced
  cache (i.e. `caches.open(...)`) `workerd` expects:
- The `Cf-Cache-Status` header to be present with the value:
  - `MISS` if it's a cache miss, in which case the rest of the response is
    ignored by `workerd`
  - `HIT` if it's a cache hit, in which case `workerd` sends the response on to
    the user, including the full headers and full body

## .put()

`workerd` guarantees:

- The method will always be `PUT`, and the cache key method will always be `GET`
- The headers will be the headers of the cache key, and the URL will be the URL
  of the cache key
- The headers will include `Cf-Cache-Namespaces` if this is a namespaced cache
  (i.e. `caches.open(...)`)
- The body contains the serialised response for storage
  - The serialised response will never: - Have a `206` status code - Have a
    `Vary: *` header - Have a `304` status code `workerd` expects:
- A `204` (success) or `413` (failure) response code. It doesn't do anything
  with either

## .delete()

`workerd` guarantees:

- The method will always be `PURGE`, and the cache key method will always be
  `GET`
- The headers will include `Cf-Cache-Namespaces` if this is a namespaced cache
  (i.e. `caches.open(...)`)
- The header `X-Real-IP` will be set to `127.0.0.1`
- The remaining headers will be the cache key headers `workerd` expects:
- Status `200` on success
- Status `404` on failure
- Status `429` on rate limit (which will throw in the user worker)
