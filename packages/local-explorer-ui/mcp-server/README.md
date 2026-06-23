# wobs-local MCP server

A dependency-free stdio MCP server that lets a coding agent debug your local
Workers dev session using the trace store the collector writes.

It talks to the **running** local explorer (`wrangler dev`) over HTTP — the same
D1 endpoint the UI uses — so there's a single writer to the SQLite store. It
enforces the access config you set on the explorer's **MCP** page and logs every
call into `mcp_calls` (shown in "Agent activity").

## Tools

- `list_recent_errors` — recent failed traces (status ≥ 500 / non-ok / threw)
- `explain_trace` — failing spans, error, slowest spans, and logs for one trace
- `search_logs` — search console logs by text/level (allowed levels only)

## Connect

Make sure the dev server is running, then add to your agent. The explorer's MCP
page can one-click install project-local config for opencode / Claude / Cursor,
and also provides copy-paste snippets + an "Add to Cursor" deep link:

```jsonc
// opencode.json
{
  "mcp": {
    "wobs-local": {
      "type": "local",
      "command": ["node", "<abs>/mcp-server.mjs"],
      "environment": { "WOBS_EXPLORER_URL": "http://localhost:8799" },
      "enabled": true
    }
  }
}
```

`WOBS_EXPLORER_URL` defaults to `http://localhost:8799`. Then ask your agent
something like *"why did my last request error?"*
