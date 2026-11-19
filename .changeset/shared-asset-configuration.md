---
"@cloudflare/workers-utils": minor
---

Share static asset configuration and hashing helpers across development and deployment

The configuration entry point now exposes asset directory validation and option resolution with caller-provided logging. The focused `@cloudflare/workers-utils/asset-hash` entry point provides the content hash used by asset uploads and local Pages serving, allowing development integrations to share this behavior without depending on deployment tooling.
