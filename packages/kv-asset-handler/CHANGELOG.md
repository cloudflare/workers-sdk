# Changelog

## 0.1.1

- ### Fixes

  - **kv-asset-handler can translate 206 responses to 200 - [harrishancock], [pull/166]**

   Fixes [wrangler#1746](https://github.com/cloudflare/wrangler/issues/1746)

   [harrishancock](https://github.com/harrishancock)
   [pull/166](https://github.com/cloudflare/kv-asset-handler/pull/166)

## 0.0.12

- ### Features

  - **Add defaultMimeType option to getAssetFromKV - [mgrahamjo], [pull/121]**

    Some static website owners prefer not to create all of their web routes as directories containing index.html files. Instead, they prefer to create pages as extensionless HTML files. Providing a defaultMimeType option will allow users to set the Content-Type header for extensionless files to text/html, which will enable this use case.

    [mgrahamjo]: https://github.com/mgrahamjo
    [pull/121]: https://github.com/cloudflare/kv-asset-handler/pull/121

  - **Add defaultMimeType to types - [shagamemnon], [pull/132]**

    Adds the newly added defaultMimeType to the exported types for this package.

    [pull/132]: https://github.com/cloudflare/kv-asset-handler/pull/132

- ### Fixes

  - **Fix text/* charset - [EatonZ], [pull/130]**

    Adds a missing `-` to the `utf-8` charset value in response mime types.

    [EatonZ]: https://github.com/EatonZ
    [pull/130]: https://github.com/cloudflare/kv-asset-handler/pull/130

  - **Cache handling for HEAD requests - [klittlepage], [pull/141]**

    This PR skips caching for incoming HEAD requests, as they should not be able to be edge cached.

    [klittlepage]: https://github.com/klittlepage
    [pull/141]: https://github.com/cloudflare/kv-asset-handler/pull/141

- ### Maintenance

  - **Markdown linting/typos - [jbampton], [pull/123], [pull/125], [pull/126], [pull/127], [pull/128], [pull/129], [pull/131], [pull/134]**

    These PRs contain various typo fixes and linting of existing Markdown files in our documentation and CHANGELOG.

    [jbampton]: https://github.com/jbampton
    [pull/123]: https://github.com/cloudflare/kv-asset-handler/pull/123
    [pull/125]: https://github.com/cloudflare/kv-asset-handler/pull/125
    [pull/126]: https://github.com/cloudflare/kv-asset-handler/pull/126
    [pull/127]: https://github.com/cloudflare/kv-asset-handler/pull/127
    [pull/128]: https://github.com/cloudflare/kv-asset-handler/pull/128
    [pull/129]: https://github.com/cloudflare/kv-asset-handler/pull/129
    [pull/131]: https://github.com/cloudflare/kv-asset-handler/pull/131
    [pull/134]: https://github.com/cloudflare/kv-asset-handler/pull/134

## 0.0.11

- ### Features

  - **Support cache revalidation using ETags and If-None-Match - [shagamemnon], [issue/62] [pull/94] [pull/113]**

    Previously, cacheable resources were not looked up from the browser cache because `getAssetFromKV` would never return a `304 Not Modified` response.

    Now, `getAssetFromKV` sets an `ETag` header on all cacheable assets before putting them in the Cache API, and therefore will return a `304` response when appropriate.

    [shagamemnon]: https://github.com/shagamemnon
    [pull/94]: https://github.com/cloudflare/kv-asset-handler/pull/94
    [pull/113]: https://github.com/cloudflare/kv-asset-handler/issues/113
    [issue/62]: https://github.com/cloudflare/kv-asset-handler/issues/62

  - **Export TypeScript types - [ispivey], [issue/43] [pull/106]**

    [ispivey]: https://github.com/ispivey
    [pull/106]: https://github.com/cloudflare/kv-asset-handler/pull/106
    [issue/43]: https://github.com/cloudflare/kv-asset-handler/issues/43

- ### Fixes

  - **Support non-ASCII characters in paths - [SukkaW], [issue/99] [pull/105]**

    Fixes an issue where non-ASCII paths were not URI-decoded before being looked up, causing non-ASCII paths to 404.

    [SukkaW]: https://github.com/SukkaW
    [pull/105]: https://github.com/cloudflare/kv-asset-handler/pull/105
    [issue/99]: https://github.com/cloudflare/kv-asset-handler/issues/99

  - **Support `charset=utf8` in MIME type - [theromis], [issue/92] [pull/97]**

    Fixes an issue where `Content-Type: text/*` was never appended with `; charset=utf8`, meaning clients would not render non-ASCII characters properly.

    [theromis]: https://github.com/theromis
    [pull/97]: https://github.com/cloudflare/kv-asset-handler/pull/97
    [issue/92]: https://github.com/cloudflare/kv-asset-handler/issues/92

  - **Fix bugs in README examples - [kentonv] [bradyjoslin], [issue/93] [pull/102] [issue/88] [pull/116]**

    [kentonv]: https://github.com/kentonv
    [bradyjoslin]: https://github.com/bradyjoslin
    [pull/102]: https://github.com/cloudflare/kv-asset-handler/pull/102
    [pull/116]: https://github.com/cloudflare/kv-asset-handler/pull/116
    [issue/93]: https://github.com/cloudflare/kv-asset-handler/issues/93
    [issue/88]: https://github.com/cloudflare/kv-asset-handler/issues/88

- ### Maintenance

  - **Make `@cloudflare/workers-types` a dependency and update deps - [ispivey], [pull/107]**

    [ispivey]: https://github.com/ispivey
    [pull/107]: https://github.com/cloudflare/kv-asset-handler/pull/107

  - **Add Code of Conduct - [EverlastingBugstopper], [pull/101]**

    [EverlastingBugstopper]: https://github.com/EverlastingBugstopper
    [pull/101]: https://github.com/cloudflare/kv-asset-handler/pull/101

## 0.0.10

- ### Features

  - **Allow extensionless files to be served - [victoriabernard92], [cloudflare/wrangler/issues/980], [pull/73]**

    Prior to this PR, `getAssetFromKv` assumed extensionless requests (e.g. `/some-path`) would be set up to be served as the corresponding HTML file in storage (e.g. `some-path.html`).
    This fix checks the `ASSET_MANIFEST` for the extensionless file name _before_ appending the HTML extension. If the extensionless file exists (e.g. `some-path` exists as a key in the ASSET_MANIFEST) then we serve that file first. If the extensionless file does not exist, then the behavior does not change (e.g. it still looks for `some-path.html`).

    [victoriabernard92]: https://github.com/victoriabernard92
    [cloudflare/wrangler/issues/980]: https://github.com/cloudflare/wrangler/issues/980
    [pull/73]: https://github.com/cloudflare/kv-asset-handler/pull/73

- ### Fixes

  - **Fix URL parsing in serveSinglePageApp - [signalnerve],[sgiacosa], [issue/72], [pull/82]**

    This fixes an issue in `serveSinglePageApp` where the request.url is used as a string to retrieve static content. For example,
    if a query parameter was set, the URL lookup would break. This fix uses a parsed URL instead of the string and adjusts the README.

    [signalnerve]: https://github.com/signalnerve
    [sgiacosa]: https://github.com/sgiacosa
    [issue/72]: https://github.com/cloudflare/kv-asset-handler/issue/72
    [pull/82]: https://github.com/cloudflare/kv-asset-handler/pull/82

## 0.0.9

- ### Fixes

  - **Building and publishing to npm - [victoriabernard92], [pull/78], [pull/79]**

    Added a `prepack` step that builds JavaScript files from the TypeScript source. This fixes previously broken `npm` publishes.

    [victoriabernard92]: https://github.com/victoriabernard92
    [issue/78]: https://github.com/cloudflare/kv-asset-handler/issue/78
    [pull/79]: https://github.com/cloudflare/kv-asset-handler/pull/79

## 0.0.8

- ### Features

  - **Support a variety of errors thrown from `getAssetFromKV` - [victoriabernard92], [issue/59] [pull/64]**

    Previously, `getAssetFromKv` would throw the same error type if anything went wrong. Now it will throw different error types so that clients can catch and differentiate them.
    For example, a 404 `NotFoundError` error implies nothing went wrong, the asset just didn't exist while
    a 500 `InternalError` means an expected variable was undefined.

    [victoriabernard92]: https://github.com/victoriabernard92
    [issue/44]: https://github.com/cloudflare/kv-asset-handler/issues/44
    [issue/59]: https://github.com/cloudflare/kv-asset-handler/issues/59
    [pull/47]: https://github.com/cloudflare/kv-asset-handler/pull/47

- ### Fixes

  - **Range Issue with Safari and videos - [victoriabernard92], [issue/60] [pull/66]**

    Previously, if you wanted to serve a video from Workers KV using `kv-asset-handler`, it would be broken on Safari due to its requirement that all videos support the [`Content-Range` header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Range). Cloudflare already has a feature that will handle these headers automatically, we just needed to take advantage of it by passing in a `Request` object to the [Cache API](https://developers.cloudflare.com/workers/reference/apis/cache/) rather than a URL string.
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

    Some browser applications employ client-side routers that handle navigation in the browser rather than on the server. These applications will work as expected until a non-root URL is requested from the server. This PR adds a special handler, `serveSinglePageApp`, that maps all HTML requests to the root index.html. This is similar to setting a static asset route pattern in an Express.js app.

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
