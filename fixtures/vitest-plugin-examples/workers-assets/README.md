# ✅ workers-static-assets-with-user-worker

This Worker contains assets as well as a Worker script

Neither integration nor unit tests should expose assets. However, you can mock them (demonstrated in this example), or write an integration test using [`unstable_startWorker()`](https://developers.cloudflare.com/workers/testing/unstable_startworker/).
