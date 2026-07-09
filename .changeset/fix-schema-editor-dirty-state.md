---
"@cloudflare/local-explorer-ui": patch
---

Fix D1 schema editor tab not tracking unsaved changes

The schema editor tab (edit table / create table) now correctly marks the tab as dirty when there are unsaved schema changes. This shows the unsaved changes indicator on the tab, triggers the browser's leave guard when navigating away, and prompts for confirmation when closing the tab.
