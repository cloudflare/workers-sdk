---
"@cloudflare/config": minor
"@cloudflare/vite-plugin": minor
---

Infer a Worker's cron expressions from `cloudflare.config.ts`

`triggers.scheduled(...)` now keeps the literal type of `schedule`, and the new `InferCrons` type collects every schedule across all branches of a config into a string union. Generated Worker types declare it as `Cloudflare.GlobalProps["crons"]`, so you can read it with `Cloudflare.GlobalProp<"crons", string>`.

`InferCrons` falls back to `string` when the config has no scheduled triggers or when any schedule is not a literal, such as one read from `process.env`. `ScheduledController.cron` still has the type `string` until the Workers runtime types read this property.
