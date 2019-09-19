import mime from 'mime/lite'

// const defaultKeyModifer = url => {
//   let parsedURL = new URL(url)
//   let pathname = parsedURL.pathname
//   if (pathname.endsWith('/')) {
//     parsedURL += 'index.html'
//   }
//   return parsedURL.toString()
// }
// const getAssetFromKV = async (request, keyModifer = defaultKeyModifer) => {
const getAssetFromKV = async (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    throw new Error(`this is not a GET request: ${request.method}`)
  }

  if (typeof __STATIC_CONTENT === undefined) {
    throw new Error(
      'there is no __STATIC_CONTENT namespace bound to the script',
    )
  }

  const cache = caches.default

  // TODO: throw if path manifest is undefined
  // TODO: throw if path is not in manifest
  // const key = keyModifer(request.url)

  const parsedUrl = new URL(request.url)
  const pathname = parsedUrl.pathname

  // key defaults to file path
  let key = pathname.slice(1)
  console.log("key", key)

  // don't cache if there's no hash
  let shouldCache = false

  // check manifest for map from file path to hash
  if (typeof __STATIC_CONTENT_MANIFEST !== "undefined") {
    let k = __STATIC_CONTENT_MANIFEST[key]
    console.log("value from manifest", k)
    if (typeof k !== "undefined") {
      key = k
      shouldCache = true
    }
  } 

  let response = await cache.match(key)
  if (response) {
    response.headers.set('CF-Cache-Status', true)
  } else {
    const mimeType = mime.getType(pathname)
    console.log("get from kv", key)
    const body = await __STATIC_CONTENT.get(key, 'arrayBuffer')
    if (body === null) {
      // TODO: should we include something about wrangler here
      throw new Error(`could not find ${key} in KV`)
    }
    response = new Response(body)
    response.headers.set('Content-Type', mimeType)
    response.headers.set('CF-Cache-Status', false)

    if (shouldCache === true) {
      event.waitUntil(cache.put(key, response.clone()));
    }
  }
  return response
}

export { getAssetFromKV }
