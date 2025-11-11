---
"miniflare": minor
"wrangler": minor
---

Add support for streaming tail consumers in local dev. This is an experimental new feature that allows you to register a `tailStream()` handler (compared to the existing `tail()` handler), which will receeive streamed tail events from your Worker (compared to the `tail()` handler, which only receives batched events after your Worker has finished processing).
