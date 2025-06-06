---
"@cloudflare/vite-plugin": minor
---

Enhanced build support for Workers with assets.

Assets that are imported in the entry Worker are now automatically moved to the client build output. This enables importing assets in your Worker and accessing them via the [assets binding](https://developers.cloudflare.com/workers/static-assets/binding/#binding). See [Static Asset Handling](https://vite.dev/guide/assets) to find out about all the ways you can import assets in Vite.

Additionally, more build scenarios are supported, including building a Worker with assets and no client entry file.
