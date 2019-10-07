# Fixes
* **Fix issue with browser caching by default** [issue/38](https://github.com/cloudflare/kv-asset-handler/issues/38)
  *  Because the edge cache was caching a `Cache-Control` header of 100 days. This fix strips out any `Cache-Control` header is `browserTTL` is not explicitly set. Also sets default edge cache max-age to 2 days. 
