---
"wrangler": patch
---

fix: rename keep_bindings to keep_vars, and make it opt-in, to keep wrangler.toml compatible with being used for Infrastructure as Code

By default, wrangler.toml is the source of truth for your environment configuration, like a terraform file.

If you change your settings (particularly your vars) in the dashboard, wrangler _will_ override them. If you want to disable this behavior, set this field to true.

Between wrangler 2.0.28 and 2.1.5, by default wrangler would _not_ delete your vars by default, breaking expected wrangler.toml behaviour.
