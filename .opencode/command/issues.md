---
description: "find issue(s) on GitHub for the given query or product"
model: anthropic/claude-haiku-4-5
---

Search through existing issues in cloudflare/workers-sdk using the gh cli to find issues matching this query and/or product name/subcommand surface:

$ARGUMENTS

Consider:

1. Similar titles or descriptions
2. Same error messages or symptoms
3. Related functionality or components (wrangler commands, miniflare, c3, vitest-pool-workers, etc.)
4. Similar feature requests

Rank results by:

1. Severity (bugs before features, breaking issues before minor ones)
2. Size (smaller, well-scoped issues before large/vague ones)

Please list any matching issues with:

- Issue number and title
- Brief explanation of why it matches the query
- Severity/size assessment
- Link to the issue

If no clear matches are found, say so.
