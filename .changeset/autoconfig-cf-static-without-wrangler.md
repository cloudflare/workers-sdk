---
"@cloudflare/autoconfig": minor
---

Set up static sites for cf without Wrangler

On cf, static site setup no longer installs Wrangler or writes `wrangler.config.ts`, because cf now builds a static site's assets itself. Detection also reports the output directory of a project that is already set up, so cf can find a static site's assets on every build, and it keeps the build command of a static site generator it doesn't otherwise know, such as `hugo` for Hugo. The Wrangler target is unchanged.
