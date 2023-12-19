---
"miniflare": patch
"wrangler": patch
---

fix: ensure User Worker gets the correct Host header in wrangler dev local mode

Some full-stack frameworks, such as Next.js, check that the Host header for a server
side action request matches the host where the application is expected to run.

In `wrangler dev` we have a Proxy Worker in between the browser and the actual User Worker.
This Proxy Worker is forwarding on the request from the browser, but then the actual User
Worker is running on a different host:port combination than that which the browser thinks
it should be on. This was causing the framework to think the request is malicious and blocking
it.

Now we update the request's Host header to that passed from the Proxy Worker in a custom `MF-Original-Url`
header, but only do this if the request also contains a shared secret between the Proxy Worker
and User Worker, which is passed via the `MF-Proxy-Signature` header. This last feature is to
prevent a malicious website from faking the Host header in a request directly to the User Worker.

Fixes https://github.com/cloudflare/next-on-pages/issues/588
