---
"create-cloudflare": minor
---

feat: telemetry collection

Cloudflare will collect telemetry about your usage of `create-cloudflare` to improve the experience. You can opt-out if you’d not like to share any information using the environment variable `CREATE_CLOUDFLARE_TELEMETRY_DISABLED=1` or the [telemetry subcommand](https://developers.cloudflare.com/pages/get-started/c3/#telemetry):

```sh
npm create cloudflare@latest telemetry disable
```

Read more about our data policy at [https://developers.cloudflare.com/workers/telemetry](https://developers.cloudflare.com/workers/telemetry).
