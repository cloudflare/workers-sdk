# @cloudflare/kv-asset-handlers

## Installation

Clone this repository and run `npm link` from inside the repo directory. Then `cd` into the directory from which you would like to import, and run `npm link @cloudflare/kv-asset-handlers`. Any changes you make to this package can be re-linked by running `npm link` from this directory.

For more info on `npm link` please read [here](https://docs.npmjs.com/cli/link).

## Usage

Currently this exports a single function `getAssetFromKV` that maps `Request` objects to KV Assets, and throws an `Error` if it cannot.

```js
import { getAssetFromKV } from '@cloudflare/kv-asset-handlers'
```

`getAssetFromKV` is a function that takes a `Request` object and returns a `Response` object if the request matches an asset in KV, otherwise it will throw an `Error`.

Note this package was designed to work with Worker Sites. If you are not using Sites make sure to call the bucket you are serving assets from `__STATIC_CONTENT`

### Example

This example checks for the existence of a value in KV, and returns it if it's there, and returns a 404 if it is not. It also serves index.html from `/`.

```js
import { getAssetFromKV } from '@cloudflare/kv-asset-handlers'

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  if (request.url.includes('/docs')) {
    try {
      return await getAssetFromKV(request, url => {
        //custom key mapping optional
        if (url.endsWith('/')) url += 'index.html'
        return url.replace('/docs', '')
      })
    } catch (e) {
      return new Response(`"${customKeyModifier(request.url)}" not found`, {
        status: 404,
        statusText: 'not found',
      })
    }
  } else return fetch(request)
}
```
