---
"wrangler": minor
---

Add `--parse-type` flag to `wrangler ai-search create`

`wrangler ai-search create` now accepts `--parse-type` to control how a website data source discovers URLs. `sitemap` (the default) reads XML sitemaps; `discover` follows links recursively.

Previously the parse type could only be chosen through the interactive wizard, which was skipped whenever `--source` was supplied — so it was impossible to create a `discover` instance from a script.

```sh
wrangler ai-search create my-instance \
  --type web-crawler \
  --source https://example.com \
  --parse-type discover
```

The interactive wizard now offers `Discover` alongside `Sitemap`. `--parse-type` is only valid with `--type web-crawler`; passing it with `--type builtin` or `--type r2` is rejected, since the API stores the value for those source types but never reads it. When the flag is omitted in non-interactive mode the field is left unset and the API default (`sitemap`) applies.
