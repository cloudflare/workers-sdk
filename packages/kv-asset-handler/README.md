# @cloudflare/kv-asset-handler

## Installation

Add this package to your `package.json` by running this in the root of your
project's directory:

```
npm i @cloudflare/kv-asset-handler
```

## Usage

### `getAssetFromKV`

`getAssetFromKV` that maps `Request` objects to KV Assets, and throws an `Error` if it cannot.

```js
import { getAssetFromKV } from '@cloudflare/kv-asset-handler'
```

`getAssetFromKV` is a function that takes a `FetchEvent` object and returns a `Response` object if the request matches an asset in KV, otherwise it will throw an `Error`.

Note this package was designed to work with Worker Sites. If you are not using Sites make sure to call the bucket you are serving assets from `__STATIC_CONTENT`

#### Example

This example checks for the existence of a value in KV, and returns it if it's there, and returns a 404 if it is not. It also serves index.html from `/`.

```js
import { getAssetFromKV } from '@cloudflare/kv-asset-handler'

addEventListener('fetch', event => {
  event.respondWith(handleEvent(event))
})

const customKeyModifier = url => {
  //custom key mapping optional
  if (url.endsWith('/')) url += 'index.html'
  return url.replace('/docs', '').replace(/^\/+/, '')
}

async function handleRequest(request) {
  if (request.url.includes('/docs')) {
    try {
      return await getAssetFromKV(request, { mapRequestToAsset: customKeyModifier })
    } catch (e) {
      return new Response(`"${customKeyModifier(event.request.url)}" not found`, {
        status: 404,
        statusText: 'not found',
      })
    }
  } else return fetch(event.request)
}
```

### `serveSinglePageApp`

`serveSinglePageApp` is a custom handler for mapping requests to a single root: `index.html`. The most common use case is single-page applications - frameworks with in-app routing - such as React Router, VueJS, etc.

#### Example

Check the incoming request to see if it evaluates to an html asset, and if so returns the root index.html; otherwise returns the requested asset (e.g. image, css file, js, etc).

```js
import { getAssetFromKV, serveSinglePageApp } from '@cloudflare/kv-asset-handler'

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  if (request.url.includes('/docs')) {
    try {
      return await getAssetFromKV(request, { mapRequestToAsset: serveSinglePageApp })
    } catch (e) {
      return new Response(`"${serveSinglePageApp(request.url)}" not found`, {
        status: 404,
        statusText: 'not found',
      })
    }
  } else return fetch(request)
}
```

### `mapRequestToAsset`

`mapRequestToAsset` encapsulates the basic logic for converting a url path to a filename. This is the default for the option of the same name passed to `getAssetFromKV`. Good to use as a baseline for custom mappers.
