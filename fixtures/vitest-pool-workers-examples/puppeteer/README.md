# ✅ Puppeteer

This Worker contains tests which are run with [Puppeteer](https://pptr.dev/). This is a useful tool for testing applications which use [static assets](https://developers.cloudflare.com/workers/static-assets/), (in particular, [full-stack frameworks](https://developers.cloudflare.com/workers/frameworks/)).

| Test                                          | Overview                                                          |
| --------------------------------------------- | ----------------------------------------------------------------- |
| [puppeteer.test.ts](./test/globalSetup.ts)    | A setup and teardown file for initializing the Puppeteer browser. |
| [puppeteer.test.ts](./test/puppeteer.test.ts) | A test using Puppeteer and `SELF` dispatches.                     |
