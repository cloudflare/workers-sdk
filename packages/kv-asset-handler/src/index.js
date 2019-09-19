import mime from 'mime/lite'

const getAssetFromKV = async request => {
  if (request.method !== 'GET') {
    throw `this is not a GET request: ${request.method}`
  }
  return parsedURL.toString()
}
const getAssetFromKV = async (req, keyModifer = defaultKeyModifer) => {
  if (req.method !== 'GET')
    throw new Error(`this is not a GET request: ${request.method}`)
  const url = req.url
  if (typeof __STATIC_CONTENT === undefined) {
    // TODO: should we say the binding is __STATIC_CONTENT or that they need change wrangler.toml
    throw new Error(
      'there is no __STATIC_CONTENT namespace bound to the script',
    )
  }
  // TODO: throw if path manifest is undefined
  // TODO: throw if path is not in manifest

  const cache = caches.default
  const pathname = new URL(request.url).pathname.slice(1)

  // TODO: match cache on manifest
  // Object.assign(request, new Request(manifest[request.url]))

  let response = await cache.match(request)

  if (!response) {
    const mimeType = mime.getType(pathname)
    const body = await __STATIC_CONTENT.get(key, 'arrayBuffer')
    if (body === null) {
      // TODO: should we include something about wrangler here
      throw new Error(`could not find ${key} in KV`)
    }

    response = new Response(body)
    response.headers.set('Content-Type', mimeType)

    // TODO: cache asset
    // event.waitUntil(cache.put(request, response.clone()));

    // TODO: add browser caching
    // if (cachePaths.some(cachePath => minimatch(path, cachePath))) {
    // 	response.headers.set("Cache-Control", "max-age=31536000, immutable");
    // 	event.waitUntil(cache.put(req, res));
    // }
  }

  return response
}

export { getAssetFromKV }
