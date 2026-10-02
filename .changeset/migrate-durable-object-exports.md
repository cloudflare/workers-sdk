---
"@cloudflare/codemods": patch
---

Infer Durable Object exports from Wrangler migration history in `cf migrate`

The codemod now preserves SQLite and legacy KV storage, renames, and deletions as export lifecycle declarations, including combined operations within a single migration. Supported Durable Object bindings and explicit exports no longer require manual review. Follow-ups identify local classes without a live export and classes whose storage cannot be determined from migration history. Transfers retain their source and destination details in a blocking follow-up that distinguishes completed transfers from pending transfers requiring coordination with the source Worker.
