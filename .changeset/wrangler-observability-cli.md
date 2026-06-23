---
"wrangler": minor
---

Add experimental `wrangler observability` commands for inspecting local-dev traces and logs

When you run `wrangler dev --experimental-observability`, traces, spans, and console logs are captured into a local store. These new commands let you — or a coding agent already running `wrangler` — query that captured data directly from the CLI, both while `wrangler dev` is running and after it has exited:

- `wrangler observability logs --last N` — print the most recent console logs (`--level` to filter)
- `wrangler observability traces --last N` — recent invocation summaries as CSV
- `wrangler observability trace <trace_id>` — the spans of a single trace as CSV
- `wrangler observability query "<SQL>"` — run a read-only SQL query against the trace store (CSV, or `--json`)
- `wrangler observability skill` — print the schema and example queries as guidance for an agent (or `--install` to write it as a `SKILL.md` into detected AI agents' skills directories, reusing the same agent detection as `wrangler --install-skills`)

The store is read read-only via Node's built-in SQLite, so querying does not require a running `wrangler dev` server. All commands accept `--persist-to` to match the directory used by `wrangler dev`.
