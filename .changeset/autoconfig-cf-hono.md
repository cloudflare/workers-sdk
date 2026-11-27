---
"@cloudflare/autoconfig": minor
---

Set up Hono projects for cf

Previously, autoconfig refused every Hono project on cf. It now sets them up to build with Vite and the Cloudflare plugin, as in Hono's Workers + Vite starter: it adds Vite when the project doesn't use it, replaces Hono's own Vite dev server and build plugins, and uses the app's entry file as the Worker entry point. An entry file that doesn't export the app, such as one that starts a Node.js server, and HonoX projects are refused with a message. The Wrangler target is unchanged.
