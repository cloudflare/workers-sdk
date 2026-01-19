---
"wrangler": minor
---

Add `wrangler complete` command for shell completion scripts (bash, zsh, powershell)

Usage:

```bash
# Bash
wrangler complete bash >> ~/.bashrc

# Zsh
wrangler complete zsh >> ~/.zshrc

# PowerShell
wrangler complete powershell > $PROFILE
```

- Uses `@bomb.sh/tab` library for cross-shell compatibility
- Completions are dynamically generated from `experimental_getWranglerCommands()` API
