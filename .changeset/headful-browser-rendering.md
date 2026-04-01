---
"wrangler": minor
"miniflare": minor
"@cloudflare/vite-plugin": minor
"@cloudflare/workers-utils": minor
---

Add experimental headful browser rendering support for local development

> **Experimental:** This feature may be removed or changed without notice.

When developing locally with the Browser Rendering API, you can enable headful (visible) mode via the `X_BROWSER_HEADFUL` environment variable to see the browser while debugging:

```sh
X_BROWSER_HEADFUL=true wrangler dev
X_BROWSER_HEADFUL=true vite dev
```

**Note:** when using `@cloudflare/playwright`, two Chrome windows may appear — the initial blank page and the one created by `browser.newPage()`. This is expected behavior due to how Playwright handles browser contexts via CDP.
