---
"wrangler": minor
---

feature: Add version-id filter for Worker tailing to filter logs by scriptVersion in a gradual deployment

This allows users to only get logs in a gradual deployment if you are troubleshooting issues
specific to one deployment. Example:
`npx wrangler tail --version-id 72d3f357-4e52-47c5-8805-90be978c403f`
