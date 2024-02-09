# @cloudflare/kv-asset-handler
  * [Installation](#installation)
  * [Usage](#usage)
  * [`getAssetFromKV`](#-getassetfromkv-)
      - [Example](#example)
    + [Return](#return)
    + [Optional Arguments](#optional-arguments)
      - [`mapRequestToAsset`](#-maprequesttoasset-)
      - [Example](#example-1)
      - [`cacheControl`](#-cachecontrol-)
        * [`browserTTL`](#-browserttl-)
        * [`edgeTTL`](#-edgettl-)
        * [`bypassCache`](#-bypasscache-)
      - [`ASSET_NAMESPACE`](#-asset-namespace-)
      - [`ASSET_MANIFEST` (optional)](#-asset-manifest---optional-)
- [Helper functions](#helper-functions)
  * [`mapRequestToAsset`](#-maprequesttoasset--1)
  * [`serveSinglePageApp`](#-servesinglepageapp-)
- [Cache revalidation and etags](#cache-revalidation-and-etags)

## Installation

Add this package to your `package.json` by running this in the root of your
project's directory:

```
npm i @cloudflare/kv-asset-handler
```

## Usage

This package was designed to work with [Worker Sites](https://workers.cloudflare.com/sites).

## `getAssetFromKV`

getAssetFromKV(FetchEvent) => Promise<Response>

`getAssetFromKV` is an async function that takes a `FetchEvent` object and returns a `Response` object if the request matches an asset in KV, otherwise it will throw a `KVError`.


#### Example

This example checks for the existence of a value in KV, and returns it if it's there, and returns a 404 if it is not. It also serves index.html from `/`.

### Return

`getAssetFromKV` returns a `Promise<Response>` with `Response` being the body of the asset requested.

Known errors to be thrown are:
- MethodNotAllowedError
- NotFoundError
- InternalError

```js
import { getAssetFromKV, NotFoundError, MethodNotAllowedError } from '@cloudflare/kv-asset-handler'

addEventListener('fetch', event => {
  event.respondWith(handleEvent(event))
})

async function handleEvent(event) {
  if (event.request.url.includes('/docs')) {
    try {
      return await getAssetFromKV(event)
    } catch (e) {
      if (e instanceof NotFoundError) {
        // ...
      } else if (e instanceof MethodNotAllowedError) {
        // ...
      } else {
        return new Response("An unexpected error occurred", { status: 500 })
      }
    }
  } else return fetch(event.request)
}
```

### Optional Arguments

You can customize the behavior of `getAssetFromKV` by passing the following properties as an object into the second argument.

```
getAssetFromKV(event, { mapRequestToAsset: ... })
```

#### `mapRequestToAsset`

mapRequestToAsset(Request) => Request

Maps the incoming request to the value that will be looked up in Cloudflare's KV

By default, mapRequestToAsset is set to the exported function [`mapRequestToAsset`](#maprequesttoasset-1).  This works for most static site generators, but you can customize this behavior by passing your own function as `mapRequestToAsset`. The function should take a `Request` object as its only argument, and return a new `Request` object with an updated path to be looked up in the asset manifest/KV.

For SPA mapping pass in the [`serveSinglePageApp`](#servesinglepageapp) function

#### Example

Strip `/docs` from any incoming request before looking up an asset in Cloudflare's KV.

```js
import { getAssetFromKV, mapRequestToAsset } from '@cloudflare/kv-asset-handler'
...
const customKeyModifier = request => {
  let url = request.url
  //custom key mapping optional
  url = url.replace('/docs', '').replace(/^\/+/, '')
  return mapRequestToAsset(new Request(url, request))
}
let asset = await getAssetFromKV(event, { mapRequestToAsset: customKeyModifier })
```

#### `cacheControl`

type: object

`cacheControl` allows you to configure options for both the Cloudflare Cache accessed by your Worker, and the browser cache headers sent along with your Workers' responses. The default values are as follows:

```javascript
let cacheControl = {
  browserTTL: null, // do not set cache control ttl on responses
  edgeTTL: 2 * 60 * 60 * 24, // 2 days
  bypassCache: false, // do not bypass Cloudflare's cache
}
```

##### `browserTTL`

type: number | null
nullable: true

Sets the `Cache-Control: max-age` header on the response returned from the Worker. By default set to `null` which will not add the header at all.

##### `edgeTTL`

type: number | null
nullable: true

Sets the `Cache-Control: max-age` header on the response used as the edge cache key. By default set to 2 days (`2 * 60 * 60 * 24`). When null will not cache on the edge at all.

##### `bypassCache`

type: boolean

Determines whether to cache requests on Cloudflare's edge cache. By default set to `false` (recommended for production builds). Useful for development when you need to eliminate the cache's effect on testing.


#### `ASSET_NAMESPACE`

type: KV Namespace Binding

The binding name to the KV Namespace populated with key/value entries of files for the Worker to serve. By default, Workers Sites uses a [binding to a Workers KV Namespace](https://developers.cloudflare.com/workers/reference/storage/api/#namespaces) named `__STATIC_CONTENT`.

It is further assumed that this namespace consists of static assets such as html, css, javascript, or image files, keyed off of a relative path that roughly matches the assumed url pathname of the incoming request.

```
return getAssetFromKV(event, { ASSET_NAMESPACE: MY_NAMESPACE })
```

#### `ASSET_MANIFEST` (optional)

type: text blob (JSON formatted)

The mapping of requested file path to the key stored on Cloudflare.

Workers Sites with Wrangler bundles up a text blob that maps request paths to content-hashed keys that are generated by Wrangler as a cache-busting measure. If this option/binding is not present, the function will fallback to using the raw pathname to look up your asset in KV. If, for whatever reason, you have rolled your own implementation of this, you can include your own by passing a stringified JSON object where the keys are expected paths, and the values are the expected keys in your KV namespace.

```
let assetManifest = { "index.html": "index.special.html" }
return getAssetFromKV(event, { ASSET_MANIFEST: JSON.stringify(assetManifest) })
```

#### `defaultMimeType` (optional)

type: string

This is the mime type that will be used for files with unrecognized or missing extensions. The default value is `'text/plain'`.

If you are serving a static site and would like to use extensionless HTML files instead of index.html files, set this to `'text/html'`.

# Helper functions

## `mapRequestToAsset`

mapRequestToAsset(Request) => Request

The default function for mapping incoming requests to keys in Cloudflare's KV.

Takes any path that ends in `/` or evaluates to an html file and appends `index.html` or `/index.html` for lookup in your Workers KV namespace.

## `serveSinglePageApp`

serveSinglePageApp(Request) => Request

A custom handler for mapping requests to a single root: `index.html`. The most common use case is single-page applications - frameworks with in-app routing - such as React Router, VueJS, etc. It takes zero arguments.

```js
import { getAssetFromKV, serveSinglePageApp } from '@cloudflare/kv-asset-handler'
...
let asset = await getAssetFromKV(event, { mapRequestToAsset: serveSinglePageApp })
```

# Cache revalidation and etags

All responses served from cache (including those with `cf-cache-status: MISS`) include an `etag` response header that identifies the version of the resource. The `etag` value is identical to the path key used in the `ASSET_MANIFEST`. It is updated each time an asset changes and looks like this: `etag: <filename>.<hash of file contents>.<extension>` (ex. `etag: index.54321.html`).

Resources served with an `etag` allow browsers to use the `if-none-match` request header to make conditional requests for that resource in the future. This has two major benefits:
* When a request's `if-none-match` value matches the `etag` of the resource in Cloudflare cache, Cloudflare will send a `304 Not Modified` response without a body, saving bandwidth.
* Changes to a file on the server are immediately reflected in the browser - even when the cache control directive `max-age` is unexpired.

#### Disable the `etag`

To turn `etags` **off**, you must bypass cache:
```js
/* Turn etags off */
let cacheControl = {
  bypassCache: true
}
```

#### Syntax and comparison context

`kv-asset-handler` sets and evaluates etags as [strong validators](https://developer.mozilla.org/en-US/docs/Web/HTTP/Conditional_requests#Strong_validation). To preserve `etag` integrity, the format of the value deviates from the [RFC2616 recommendation to enclose the `etag` with quotation marks](https://tools.ietf.org/html/rfc2616#section-3.11). This is intentional. Cloudflare cache applies the `W/` prefix to all `etags` that use quoted-strings -- a process that converts the `etag` to a "weak validator" when served to a client.
