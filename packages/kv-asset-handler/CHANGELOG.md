# Changelog

## 0.0.8

- ### Features

  - **Support a variety of errors thrown from `getAssetFromKV` - [victoriabernard92], [issue/59] [pull/64]**

    Support for throwing specific errors to allow the handler of `getAssetFromKV` to catch and differentiate them.
    For example, a 404 `NotFoundError` error implies nothing went wrong, the asset just didn't exist while
    a 500 `InternalError` means an expected variable was undefined.

    [victoriabernard92]: https://github.com/victoriabernard92
    [issue/44]: https://github.com/cloudflare/kv-asset-handler/issues/44
    [issue/59]: https://github.com/cloudflare/kv-asset-handler/issues/59
    [pull/47]: https://github.com/cloudflare/kv-asset-handler/pull/47

- ### Fixes

  - **Range Issue with Safari and videos - [victoriabernard92], [issue/60] [pull/66]**

    Support passing in a Request instead of simply a URL string into the cache as the cache key to prevent
    videos from not including the range headers.

    [victoriabernard92]: https://github.com/victoriabernard92
    [shagamemnon]: https://github.com/shagamemnon 
    [issue/60]: https://github.com/cloudflare/kv-asset-handler/issues/60
    [issue/63]: https://github.com/cloudflare/kv-asset-handler/issues/63
    [pull/47]: https://github.com/cloudflare/kv-asset-handler/pull/52
    [pull/66]: https://github.com/cloudflare/kv-asset-handler/pull/66

  - **Support custom asset namespaces passed into `getAssetFromKV` - [victoriabernard92], [issue/67] [pull/68]**

    This functionality was documented but not properly supported. Tests and implementation fixes applied.

    [victoriabernard92]: https://github.com/victoriabernard92
    [issue/67]: https://github.com/cloudflare/kv-asset-handler/issues/67
    [pull/68]: https://github.com/cloudflare/kv-asset-handler/pull/68


## 0.0.7

- ### Features

  - **Add handler for SPAs - [ashleymichal], [issue/46] [pull/47]**

    Some browser applications employ client-side routers that handle navigation in the browser rather than on the server. These applications will work as expected until a non-root URL is requested from the server. This PR adds a special handler, `serveSinglePageApp`, that maps all html requests to the root index.html. This is similar to setting a static asset route pattern in an Express.js app.

    [ashleymichal]: https://github.com/ashleymichal
    [issue/46]: https://github.com/cloudflare/kv-asset-handler/issues/46
    [pull/47]: https://github.com/cloudflare/kv-asset-handler/pull/47

- ### Documentation

  - **Add function API for `getAssetFromKV` to README.md - [ashleymichal], [issue/48] [pull/52]**

    This function, used to abstract away the implementation for retrieving static assets from a Workers KV namespace, includes a lot of great options for configuring your own, bespoke "Workers Sites" implementation. This PR adds documentation to the README for use by those who would like to tinker with these options.

    [ashleymichal]: https://github.com/ashleymichal
    [issue/46]: https://github.com/cloudflare/kv-asset-handler/issues/48
    [pull/47]: https://github.com/cloudflare/kv-asset-handler/pull/52

## 0.0.6

- ### Fixes

  - **Improve caching - [victoriabernard92], [issue/38] [pull/37]**

  	- Don't use browser cache by default: Previously, `kv-asset-handler` would set a `Cache-Control` header on the response sent back from the Worker to the client. After this fix, the `Cache-Control` header will only be set if `options.cacheControl.browserTTL` is set by the caller.

  	- Set default edge caching to 2 days: Previously the default cache time for static assets was 100 days. This PR sets the default to 2 days. This can be overridden with `options.cacheControl.edgeTTL`.

    [victoriabernard92]: https://github.com/victoriabernard92
    [issue/38]: https://github.com/cloudflare/kv-asset-handler/issues/38
    [pull/37]: https://github.com/cloudflare/kv-asset-handler/pull/37
