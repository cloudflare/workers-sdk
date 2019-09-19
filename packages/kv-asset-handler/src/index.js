import mime from 'mime/lite'

const defaultKeyModifier = pathname => {
  if (pathname === '/') {
    pathname = '/index.html'
  }
  return pathname
}

const getAssetFromKV = async (event, keyModifier = defaultKeyModifier) => {
  const request = event.request
  if (request.method !== 'GET') {
    throw new Error(`this is not a GET request: ${request.method}`)
  }

  if (typeof __STATIC_CONTENT === "undefined") {
    throw new Error('there is no __STATIC_CONTENT namespace bound to the script')
  }

  const cache = caches.default

  const parsedUrl = new URL(request.url)
  const pathname = keyModifier(parsedUrl.pathname)

  // remove prepended /
  let key = pathname.slice(1)

  // don't cache if there's no hash
  let shouldCache = false

  // check manifest for map from file path to hash
  if (typeof __STATIC_CONTENT_MANIFEST !== 'undefined') {
    let k = JSON.parse(__STATIC_CONTENT_MANIFEST)[key]
    if (typeof k !== 'undefined') {
      key = k
      shouldCache = true
    }
  }

  const cacheKey = `${parsedUrl.origin}/${key}`

  let response = await cache.match(cacheKey)
  if (response) {
    let headers = new Headers(response.headers)
    headers.set('CF-Cache-Status', true)
    response = new Response(response.body, {headers})
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
      event.waitUntil(cache.put(cacheKey, response.clone()))
    }
  }
  return response
}

export { getAssetFromKV }
