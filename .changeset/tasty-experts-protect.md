---
"wrangler": patch
---

fix: require worker name for rollback

Previously, Wrangler would fail with a cryptic error if you tried to run `wrangler rollback` outside of a directory containing a Wrangler configuration file with a `name` defined. This change validates that a worker name is defined, and allows you to set it from the command line using the `--name` flag.
