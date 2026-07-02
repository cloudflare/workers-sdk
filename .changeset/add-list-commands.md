---
"wrangler": minor
---

Add `wrangler list-commands` command

A new `list-commands` command displays all available Wrangler commands and subcommands in a tree structure, providing a quick overview of the full CLI surface without the verbosity of `--help`.

Supports the following flags:

- `--json` for machine-readable output
- `--include-aliases` to optionally show alias commands
- `--all` to expand the full command tree at every depth instead of only showing top-level commands
- `--base` to scope output to a specific subtree (e.g. `--base="d1 migrations"`)

When an invalid command is entered, Wrangler now suggests running `list-commands` to discover available commands.
