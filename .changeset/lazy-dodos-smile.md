---
"create-cloudflare": patch
---

Stop adding a custom React Router server entry file to new projects

React Router 8.2 now provides a Web Streams-compatible default server entry for non-Node runtimes. Newly generated Cloudflare projects use that default and only need `app/entry.server.tsx` for custom server rendering.
