---
"wrangler": patch
---

Throw an error for malformed `_routes.json` during Pages deployment

Previously, when a `_routes.json` file contained invalid JSON syntax (such as trailing commas), the JSON parse error was silently swallowed and the deployment would proceed without uploading the routes file. This made it difficult to diagnose why custom routing rules were not being applied.

Now, a clear error message is displayed when `_routes.json` contains invalid JSON, including the specific syntax error to help users fix the issue.
