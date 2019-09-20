import mime from 'mime/lite'

const defaultKeyModifier = pathname => {
  if (pathname.endsWith('/')) {
    pathname = pathname.concat('index.html')
  }
  return pathname
}
const defaultCacheControl = {
  browserTTL: 0,
  edgeTTL: 720,
  bypassCache: null,
}

const getAssetFromKV = async (event, options) => {
  options = Object.assign(
    {
      __STATIC_CONTENT: __STATIC_CONTENT_DEFAULT,
      keyModifier: defaultKeyModifier,
      cacheControl: defaultCacheControl,
    },
    options,
  )
  const request = event.request
  const __STATIC_CONTENT = options.__STATIC_CONTENT
  if (request.method !== 'GET') {
    throw new Error(`this is not a GET request: ${request.method}`)
  }
  if (typeof __STATIC_CONTENT === 'undefined') {
    throw new Error(`there is no ${__STATIC_CONTENT} namespace bound to the script`)
  }
  const parsedUrl = new URL(request.url)
  const pathname = options.keyModifier(parsedUrl.pathname)

  // remove prepended /
  let key = pathname.slice(1)

  const cache = caches.default

  // If cache controls not set, don't cache if there's no hash
  let shouldCache = false

  // check manifest for map from file path to hash
  if (typeof __STATIC_CONTENT_MANIFEST !== 'undefined') {
    let hashKey = JSON.parse(__STATIC_CONTENT_MANIFEST)[key]
    if (typeof hashKey !== 'undefined') {
      key = hashKey
      shouldCache = true
    }
  }

  const cacheKey = `${parsedUrl.origin}/${key}` // we normally cache with query param and do NOT ignore query

  // set cache options by either evaluating the handler passed in
  // or whatever settings were passed in
  const evalCacheOpts = (() => {
    switch (typeof options.cacheControl) {
      case 'function':
        return options.cacheControl(request)
      case 'object':
        return options.cacheControl
      default:
        return defaultCacheControl
    }
  })()
  options.cacheControl = Object.assign({}, defaultCacheControl, evalCacheOpts)
  //if bypassCache set to default then base CF caching on shouldCache(if hash exist)
  shouldCache = options.cacheControl.bypassCache !== null ? !evalCacheOpts.bypassCache : shouldCache

  let response = await cache.match(cacheKey)
  if (response) {
    response.headers.set('CF-Cache-Status', 'HIT')
    response = new Response(response.body, { headers })
  } else {
    const mimeType = mime.getType(pathname)
    const body = await __STATIC_CONTENT.get(key, 'arrayBuffer')
    if (body === null) {
      throw new Error(`could not find ${key} in ${__STATIC_CONTENT}`)
    }
    response = new Response(body)
    response.headers.set('Content-Type', mimeType)

    // TODO: could implement CF-Cache-Status REVALIDATE if path w/o hash existed in manifest

    if (shouldCache === true) {
      response.headers.set('CF-Cache-Status', 'MISS')
      response.headers.set('cache-control', 'max-age=' + options.cacheControl.edgeTTL)
      event.waitUntil(cache.put(cacheKey, response.clone()))
    }
  }
  response.headers.set('cache-control', 'max-age=' + options.cacheControl.browserTTL)
  return response
}

export { getAssetFromKV }
