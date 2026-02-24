---
"@cloudflare/local-explorer-ui": minor
---

Added the query tab to the local explorer data studio

The local explorer data studio now includes a query tab that allows you to execute SQL queries directly against a D1 database. This adds:

- A CodeMirror-based SQL editor with syntax highlighting
- Query execution with result summary showing rows read
- Results from queries are not currently visible until the table component has been implemented

This is a WIP experimental feature.
