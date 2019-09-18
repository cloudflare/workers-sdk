import mime from 'mime/lite'

const getAssetFromKV = async request => {
  if (request.method !== 'GET') {
    throw `this is not a GET request: ${request.method}`
  }
  return path.slice(1)
}
const getAssetFromKV = async (path, keyModifer = defaultKeyModifer) => {
  if (typeof __STATIC_CONTENT === undefined) {
    // TODO: should we say the binding is __STATIC_CONTENT or that they need change wrangler.toml
    throw 'there are no assets defined in KV'
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
    const body = await __STATIC_CONTENT.get(pathname, 'arrayBuffer')
    if (body === null) {
      // TODO: should we include something about wrangler here
      throw `could not find ${pathname} in KV`
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
