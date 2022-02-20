---
"wrangler": patch
---

fix(pages): ensure remaining args passed to `pages dev` command are captured

It is common to pass additional commands to `pages dev` to generate the input source.
For example:

```bash
npx wrangler@beta pages dev -- npm run dev
```

Previously the args after `--` were being dropped.
This change ensures that these are captured and used correctly.

Fixes #482
