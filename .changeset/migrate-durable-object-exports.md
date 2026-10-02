---
"@cloudflare/codemods": patch
---

Infer Durable Object exports from Wrangler migration history in `cf migrate`

The codemod now preserves SQLite and legacy KV storage, renames, and deletions as export lifecycle declarations. Supported Durable Object bindings and explicit exports no longer require manual review. Follow-ups identify local classes without a live export and classes whose storage cannot be determined from migration history.
