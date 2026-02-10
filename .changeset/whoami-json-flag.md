---
"wrangler": minor
---

Add `--json` flag to `wrangler whoami` for machine-readable output

`wrangler whoami --json` now outputs structured JSON containing authentication status, auth type, email, accounts, and token permissions. When the user is not authenticated, the command exits with a non-zero status code and outputs `{"loggedIn":false}`, making it easy to check auth status in shell scripts without parsing text output.

```bash
# Parse the JSON output
wrangler whoami --json | jq '.accounts'

# Check if authenticated in a script. Returns 0 if authenticated, non-zero if not.
if wrangler whoami --json > /dev/null 2>&1; then
  echo "Authenticated"
else
  echo "Not authenticated"
fi

```
