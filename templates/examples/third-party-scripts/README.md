# Third Party Scripts

Significantly improves performance of common static third-party scripts:

- Rewrites the HTML to replace the third-party script URLs with URLs that are proxied through the origin and appends a content hash to the URL.
- On the proxied requests it returns the proxied request, stripping most headers and extending the cache to 1 year (which is safe to do since the URL will change if the content ever changes)

This provides a few big performance and reliability benefits:

- Browsers will not have to establish new connections to the third-party origin (saving 3 round trips).
- On HTTP/2 connections the scripts will be properly prioritized relative to the other page content.
- Browsers will only re-request the content if the content itself actually changes, independent of the original cache settings.
- If there are connectivity problems between the browser and the third-party or availability problems with the third-party those will be bypassed since the content is cached on the Cloudflare edge.

## Testing

For testing purposes it also supports turning off the worker through query parameters added to the page URL:

- `cf-worker=bypass` disables all rewriting. i.e. `https://www.example.com/?cf-worker=bypass`

## License

BSD 3-Clause licensed. See the LICENSE file for details.
