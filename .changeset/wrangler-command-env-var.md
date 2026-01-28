---
"wrangler": minor
---

Add `WRANGLER_COMMAND` environment variable to custom build commands

When using a custom build command in `wrangler.toml`, you can now detect whether `wrangler dev` or `wrangler deploy` triggered the build by reading the `WRANGLER_COMMAND` environment variable. This variable will be set to `"dev"`, `"deploy"`, `"versions upload"`, or `"types"` depending on which command invoked the build.

This allows you to customize your build process based on the deployment context. For example:

```bash
# In your custom build script
if [ "$WRANGLER_COMMAND" = "dev" ]; then
  echo "Building for development..."
else
  echo "Building for production..."
fi
```
