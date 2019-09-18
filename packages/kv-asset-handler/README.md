# @cloudflare/kv-asset-handlers

## Installation

Clone this repository and run `npm link` from inside the repo directory. Then `cd` into the directory from which you would like to import, and run `npm link @cloudflare/kv-asset-handlers`. Any changes you make to this package can be re-linked by running `npm link` from this directory. 

For more info on `npm link` please read [here](https://docs.npmjs.com/cli/link).

## Usage

Currently this exports a single worker that maps `Request` objects to KV Assets

```js
import { AssetWorker } from "@cloudflare/kv-asset-handlers";
```

`AssetWorker` is a JavaScript class that implements a condition and a handler, which both take a `Request` object. `condition` returns a boolean value, whether or not this request can be served from KV, and `handler` returns a `Response` object with the value stored in KV.

### Example

This package could be used in conjunction with other workers that implement `condition` and `handler`, but this example is an asset server. It checks for the existence of a value in KV, and returns it if it's there, and returns a 404 if it is not. It also serves index.html from `/`.

```js
  const subworkers = [new AssetWorker()];

  let url = new URL(request.url);
  if (url.pathname === "/") {
    request = new Request(`${url}/index.html`)
  }

  for (let i = 0; i < subworkers.length; i++) {
    const subworker = subworkers[i];
    if (await subworker.condition(request)) {
      return await subworker.handler(request);
    }
  }
  return new Response("not found", { status: 404, statusText: "not found" });
```

You could also implement this differently in conjunctin with other worker logic

```js
  if (request.url.contains("api")) {
    return new Response("api response")
  }
  let assetWorker = new AssetWorker();
  if (await assetWorker.condition(request) {
    let response = await assetWorker.handler(request)
    // do something with htmlRewriter
    return response
  }
  return new Response("not found", { status: 404 })
```
