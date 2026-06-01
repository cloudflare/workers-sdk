---
"wrangler": patch
---

Adapt React Router autoconfig based on `v8_middleware` future flag

The React Router autoconfig (`wrangler setup`) now detects whether `v8_middleware: true` is set in the user's `react-router.config.ts`. When it is, the generated `workers/app.ts` uses a simplified fetch handler without `AppLoadContext` module augmentation, and the generated `app/entry.server.tsx` omits the `_loadContext` parameter. When `v8_middleware` is not set, the existing `AppLoadContext` pattern with `env`/`ctx` params is preserved.

This avoids breaking projects that use the `v8_middleware` future flag (which changes the context API from `AppLoadContext` to `RouterContextProvider`), while keeping the traditional pattern for projects that haven't opted in.
