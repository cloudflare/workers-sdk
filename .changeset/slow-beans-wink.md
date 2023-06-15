---
"wrangler": patch
---

fix: Report correct IP & port in local mode

In remote mode, the onReady callback was being incorrectly called with the remote host, rather than the local host of the proxy server. It was also only called with the pre port-assignment port, which is sometimes 0. This meant that the browser hotkey sometimes opened a remote route, rather the local proxy. Now, the borwser hotkey will always open the local proxy.
