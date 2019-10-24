# Changelog

## 0.0.6

- ### Fixes 

  - **Improve caching - [victoriabernard92], [issue/38][pull/37]**

  	- Don't use browser cache by default: Previously, `kv-asset-handler` would set a `Cache-Control` header on the response sent back from the Worker to the client. After this fix, the `Cache-Control` header will only be set if `options.cacheControl.browserTTL` is set by the caller.

  	- Set default edge caching to 2 days: Previously the default cache time for static assets was 100 days. This PR sets the default to 2 days. This can be overridden with `options.cacheControl.edgeTTL`.

    [victoriabernard92]: https://github.com/victoriabernard92
    [issue/38]: https://github.com/cloudflare/kv-asset-handler/issues/38
    [pull/37]: https://github.com/cloudflare/kv-asset-handler/pull/37
