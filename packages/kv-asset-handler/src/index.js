import mime from 'mime/lite'

const defaultKeyModifer = pathname => {
  if (pathname === '/') {
    pathname = '/index.html'
  }
  return pathname
}

const getAssetFromKV = async (event, keyModifer = defaultKeyModifer) => {
  const request = event.request
  if (request.method !== 'GET') {
    throw new Error(`this is not a GET request: ${request.method}`)
  }

  if (typeof __STATIC_CONTENT === undefined) {
    throw new Error('there is no __STATIC_CONTENT namespace bound to the script')
  }

  const cache = caches.default

  const key = keyModifer(request.url)

  const parsedUrl = new URL(request.url)
  const pathname = defaultKeyModifier(parsedUrl.pathname)

  // remove prepended /
  key = pathname.slice(1)

  // don't cache if there's no hash
  let shouldCache = false

  // check manifest for map from file path to hash
  if (typeof __STATIC_CONTENT_MANIFEST !== 'undefined') {
    let k = __STATIC_CONTENT_MANIFEST[key]
    if (typeof k !== 'undefined') {
      key = k
      shouldCache = true
    }
  }

  let response = await cache.match(key)
  if (response) {
    response.headers.set('CF-Cache-Status', true)
  } else {
    const mimeType = mime.getType(pathname)
    const body = await __STATIC_CONTENT.get(key, 'arrayBuffer')
    if (body === null) {
      throw new Error(`could not find ${key} in __STATIC_CONTENT`)
    }
    response = new Response(body)
    response.headers.set('Content-Type', mimeType)
    response.headers.set('CF-Cache-Status', false)

    if (shouldCache === true) {
      event.waitUntil(cache.put(key, response.clone()))
    }
  }
  return response
}

export { getAssetFromKV }
