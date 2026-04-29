---
"wrangler": minor
---

`wrangler preview` now interactively syncs your local previews config to the platform's shared Preview settings

When you run `wrangler preview`, it now shows a diff between your local `previews` config and the Worker's shared Preview settings on the platform, and asks for confirmation before applying any changes. Your config file becomes the source of truth — the dashboard always reflects what your config says it should, matching the mental model from `wrangler deploy`.

Previously, running `wrangler preview` only applied your previews config as per-deployment overrides. The platform's shared settings (visible in the dashboard) would not update unless you separately ran `wrangler preview settings update`. This created a gap between what you deployed and what the platform knew about, and required users to remember a second command. The separate `settings update` command was also additive-only — it could push settings but never remove them, leaving stale state on the platform.

With this change:

- `wrangler preview` shows a diff of any changes to shared Preview settings and asks for confirmation before applying them
- Destructive changes (removing settings present on the platform but absent from your config) trigger a stronger confirmation prompt that explicitly mentions the change affects shared state
- Removing values from your `previews` block now flows through to the platform when you confirm — closing the source-of-truth loop in both directions
- `wrangler preview settings update` now performs full replacement instead of additive merge, making it possible to remove settings from the CLI for the first time
- A new `--skip-confirmation` flag (alias `-y`) is available on `wrangler preview` for non-interactive contexts like CI

If you don't want to sync, answer "no" to the prompt — your deployment will still succeed. If your `wrangler.jsonc` has no `previews` block and the platform also has no shared Preview settings, no prompt is shown.
