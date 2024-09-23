---
"create-cloudflare": minor
---

feat: telemetry collection

Cloudflare will collect telemetry about your usage of `create-cloudflare` to improve the experience.

If you would like to disable telemetry, you can run:

```sh
npm create cloudflare telemetry disable
```

Alternatively, you can set an environment variable:

```sh
export CREATE_CLOUDFLARE_TELEMETRY_DISABLED=1
```

Read more about our data policy at https://github.com/cloudflare/workers-sdk/blob/main/packages/create-cloudflare/telemetry.md.
