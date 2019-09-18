# @cloudflare/kv-asset-handlers

## Installation

Clone this repository and run `npm link` from inside the repo directory. Then `cd` into the directory from which you would like to import, and run `npm link @cloudflare/kv-asset-handlers`. Any changes you make to this package can be re-linked by running `npm link` from this directory.

For more info on `npm link` please read [here](https://docs.npmjs.com/cli/link).

## Usage

Currently this exports a single function `getAssertFromKV` that maps `Request` objects to KV Assets, and throws an `Error` if it cannot.

```js
import { getAssetFromKV } from '@cloudflare/kv-asset-handlers'
```

`getAssetFromKV` is a function that takes a `Request` object and returns a `Response` object if the request matches an asset in KV, otherwise it will throw an `Error`.

### Example

This example checks for the existence of a value in KV, and returns it if it's there, and returns a 404 if it is not. It also serves index.html from `/`.

```js
import { getAssetFromKV } from '@cloudflare/kv-asset-handlers'

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  try {
    return await getAssetFromKV(request.url)
  } catch (e) {
    return new Response(`"${url}" not found`, {
      status: 404,
      statusText: 'not found',
    })
  }
}
```
