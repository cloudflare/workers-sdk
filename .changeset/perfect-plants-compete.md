---
"miniflare": minor
"wrangler": minor
---

In 2023 we announced [breakpoint debugging support](https://blog.cloudflare.com/debugging-cloudflare-workers/) for Workers, which meant that you could easily debug your Worker code in Wrangler's built-in devtools (accessible via the `[d]` hotkey) as well as multiple other devtools clients, [including VSCode](https://developers.cloudflare.com/workers/observability/dev-tools/breakpoints/). For most developers, breakpoint debugging via VSCode is the most natural flow, but until now it's required [manually configuring a `launch.json` file](https://developers.cloudflare.com/workers/observability/dev-tools/breakpoints/#setup-vs-code-to-use-breakpoints), running `wrangler dev`, and connecting via VSCode's built-in debugger.

Now, using VSCode's built-in [JavaScript Debug Terminals](https://code.visualstudio.com/docs/nodejs/nodejs-debugging#_javascript-debug-terminal), there are just two steps: open a JS debug terminal and run `wrangler dev` (or `vite dev`). VSCode will automatically connect to your running Worker (even if you're running multiple Workers at once!) and start a debugging session.
