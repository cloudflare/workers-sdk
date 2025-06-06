---
"@cloudflare/vite-plugin": minor
---

Enhanced build support for Workers with assets.

Assets that are imported in the entry Worker are now automatically moved to the client build output. This enables importing assets in your Worker and accessing them via the [assets binding](https://developers.cloudflare.com/workers/static-assets/binding/#binding). See [Static Asset Handling](https://vite.dev/guide/assets) to find out about all the ways you can import assets in Vite.

Additionally, a broader range of build scenarios are now supported. These are:

- Assets only build with client entry/entries
- Assets only build with no client entry/entries that includes `public` directory assets
- Worker(s) + assets build with client entry/entries
- Worker(s) + assets build with no client entry/entries that includes imported and/or `public` directory assets
- Worker(s) build with no assets
