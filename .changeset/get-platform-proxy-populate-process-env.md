---
"wrangler": minor
---

Add `populateProcessEnv` option to `getPlatformProxy` to populate `process.env` with text and JSON bindings

The `getPlatformProxy` utility now supports an optional `populateProcessEnv` option that mirrors the workerd behavior of the `nodejs_compat_populate_process_env` compatibility flag.

When enabled, `process.env` is side-effectfully updated with environment variables and secrets from your wrangler configuration and `.env` files. JSON values are stringified. The original `process.env` values are restored when `dispose()` is called.

Behavior:

- `populateProcessEnv: true` - Always populate `process.env`
- `populateProcessEnv: false` - Never populate `process.env`
- `populateProcessEnv: undefined` (default) - Follows the same rules as workerd:
  - Enabled when `nodejs_compat` compatibility flag is set AND either:
    - `compatibility_date` is `"2025-04-01"` or later, OR
    - `nodejs_compat_populate_process_env` flag is explicitly set
  - Disabled when `nodejs_compat_do_not_populate_process_env` flag is set

Example:

```typescript
import { getPlatformProxy } from "wrangler";

// Uses default behavior based on your wrangler.json compat settings
const { env, dispose } = await getPlatformProxy();

// process.env now contains your vars and secrets (if enabled)
console.log(process.env.MY_VAR);

// Cleanup restores original process.env
await dispose();
```

```typescript
// Explicitly enable regardless of compat settings
const { env, dispose } = await getPlatformProxy({
	populateProcessEnv: true,
});
```
