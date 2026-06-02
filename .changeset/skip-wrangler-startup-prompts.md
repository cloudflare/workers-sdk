---
"wrangler": minor
---

Add `skip_wrangler_startup_prompts` configuration option

You can now set `skip_wrangler_startup_prompts: true` in your `wrangler.json` to suppress interactive confirmation prompts that Wrangler shows during its startup sequence. Currently this skips the AI coding agent skills installation prompt.

The `--install-skills` CLI flag still overrides this option and forces skill installation regardless of the config setting.

```jsonc
// wrangler.json
{
	"skip_wrangler_startup_prompts": true,
}
```
