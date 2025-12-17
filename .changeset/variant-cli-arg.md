---
"create-cloudflare": minor
---

Add `--variant` CLI argument to select framework variants non-interactively. This allows users to skip the variant selection prompt when creating React projects by specifying the variant directly, for example: `npm create cloudflare my-app -- --framework=react --platform=workers --variant=react-ts`.
