---
"@cloudflare/local-explorer-ui": patch
---

Fix D1 schema editor tab not tracking unsaved changes

The schema editor tab (edit table / create table) now correctly marks the tab as dirty when there are unsaved schema changes. This shows the unsaved changes indicator on the tab, triggers the browser's leave guard when navigating away, and prompts for confirmation when closing the tab.

Additionally, column and constraint deletions now properly mark the schema as dirty. Previously, removing a column or constraint would filter the entry out of the state array entirely, causing the dirty-state check to miss the change.
