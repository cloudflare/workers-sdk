# Changelog

## 0.0.6

- ### Fixes 

  - **Don't use browser cache by default** - [issue/38](https://github.com/cloudflare/kv-asset-handler/issues/38) - [victoriabernard92](https://github.com/victoriabernard92)
  
    Previously, `kv-asset-handler` was returning a `Cache-Control` header of 100 days to the browser. After this fix, the `Cache-Control` header will be absent if `options.cacheControl.browserTTL` is not explicitly set. 

  - **Set default edge caching to 2 days** - [pull/37](https://github.com/cloudflare/kv-asset-handler/pull/37) - [victoriabernard92](https://github.com/victoriabernard92)
    
    Previously the default cache time for static assets was 100 days, it is now 2 days. This can be overridden with `options.cacheControl.edgeTTL`
