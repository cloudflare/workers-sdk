---
"wrangler": patch
---

Add analytics properties to secret commands for better usage insights

Secret commands (`wrangler secret put`, `wrangler secret bulk`, and their Pages/versions equivalents) now include additional analytics properties to help understand how secrets are being managed:

- `secretOperation`: Whether this is a "single" or "bulk" secret operation
- `secretSource`: How the secret was provided ("interactive", "stdin", or "file")
- `secretFormat`: For bulk operations, the format used ("json" or "dotenv")
- `hasEnvironment`: Whether an environment was specified

These properties help improve the developer experience by understanding common usage patterns. No sensitive information (secret names, values, or counts) is tracked.
