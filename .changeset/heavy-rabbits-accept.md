---
"wrangler": patch
---

fix: display the correct help information when a subcommand is invalid

Previously, when an invalid subcommand was used, such as `wrangler r2 foo`,
the help that was displayed showed the top-level commands prefixed by the command in used.
E.g.

```
wrangler r2 init [name]       📥 Create a wrangler.toml configuration file
wrangler r2 dev [script]      👂 Start a local server for developing your worker
wrangler r2 publish [script]  🆙 Publish your Worker to Cloudflare.
...
```

Now the correct command help is displayed:

```
$ wrangler r2 foo

✘ [ERROR] Unknown argument: foo


wrangler r2

📦 Interact with an R2 store

Commands:
  wrangler r2 bucket  Manage R2 buckets

Flags:
  -c, --config   Path to .toml configuration file  [string]
  -h, --help     Show help  [boolean]
  -v, --version  Show version number  [boolean]
```

Fixes #871
