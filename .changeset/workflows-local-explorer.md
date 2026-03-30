---
"miniflare": minor
"@cloudflare/workflows-shared": patch
---

Add Workflows support to the local explorer UI.

The local explorer (`/cdn-cgi/explorer/`) now includes a full Workflows dashboard for viewing and managing workflow instances during local development.

UI features:

- Workflow instance list with status badges, creation time, action buttons, and pagination
- Status summary bar with instance counts per status
- Status filter dropdown and search
- Instance detail page with step history, params/output cards, error display, and expandable step details
- Create instance dialog with optional ID and JSON params
