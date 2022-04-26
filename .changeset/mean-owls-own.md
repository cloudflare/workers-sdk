---
"wrangler": patch
---

feat: Add validation to the `name` field in configuration.
The validation will warn users that the field can only be "type string,
alphanumeric, underscores, and lowercase with dashes only" using the same RegEx as the backend

resolves #795 #775
