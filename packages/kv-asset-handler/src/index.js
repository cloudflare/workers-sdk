import mime from 'mime/lite'

const defaultKeyModifier = pathname => {
  // E.g. If path is /about/, get key /about/index.html
  if (pathname.endsWith('/')) {
    pathname = pathname.concat('index.html')
  }
  // E.g. If path is /about, get /about/index.html
  // This logic ensures that weird paths with ".", like /about.me/,
  // also produce /about.me/index.html (expected).
  else if (!pathname.endsWith('/') && !mime.getType(pathname)) {
    pathname = pathname.concat('/index.html')
  }
  // remove prepended /
  pathname = pathname.replace(/^\/+/, '')
  return pathname
}
const defaultCacheControl = {
  browserTTL: 0,
  edgeTTL: 100 * 60 * 60 * 24, // 100 days
  bypassCache: false,
}

const getAssetFromKV = async (event, options) => {
  options = Object.assign(
    {
      ASSET_NAMESPACE: __STATIC_CONTENT,
      ASSET_MANIFEST: __STATIC_CONTENT_MANIFEST,
      keyModifier: defaultKeyModifier,
      cacheControl: defaultCacheControl,
    },
    options,
  )

  const request = event.request
  const ASSET_NAMESPACE = options.ASSET_NAMESPACE
  const ASSET_MANIFEST = options.ASSET_MANIFEST

  if (request.method !== 'GET') {
    throw new Error(`this is not a GET request: ${request.method}`)
  }
  if (typeof ASSET_NAMESPACE === 'undefined') {
    throw new Error(`there is no ${ASSET_NAMESPACE} namespace bound to the script`)
  }
  const parsedUrl = new URL(request.url)
  const pathname = options.keyModifier(parsedUrl.pathname)
  let key = options.keyModifier(parsedUrl.pathname)

  const cache = caches.default

  let shouldEdgeCache = false
  let hashKey = key
  // check manifest for map from file path to hash
  if (typeof ASSET_MANIFEST !== 'undefined') {
    hashKey = JSON.parse(ASSET_MANIFEST)[key]
    if (typeof hashKey !== 'undefined') {
      // cache on edge if content is hashed
      shouldEdgeCache = true
    }
  }

  // this excludes search params from cache key
  const cacheKey = `${parsedUrl.origin}/${hashKey}`

  // options.cacheControl can be a function that takes a request or an object
  // the result should be formed like the defaultCacheControl object
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

  // override shouldEdgeCache if options say to bypassCache
  if (options.cacheControl.bypassCache) {
    shouldEdgeCache = !options.cacheControl.bypassCache
  }

  let response = await cache.match(cacheKey)
  const mimeType = mime.getType(pathname)

  if (response) {
    let headers = new Headers(response.headers)
    headers.set('CF-Cache-Status', 'HIT')
    response = new Response(response.body, { headers })
  } else {
    const body = await __STATIC_CONTENT.get(hashKey, 'arrayBuffer')
    if (body === null) {
      throw new Error(`could not find ${key} in your content namespace`)
    }
    response = new Response(body)

    // TODO: could implement CF-Cache-Status REVALIDATE if path w/o hash existed in manifest

    if (shouldEdgeCache === true) {
      response.headers.set('CF-Cache-Status', 'MISS')
      response.headers.set('Cache-Control', `max-age=${options.cacheControl.edgeTTL}`)
      event.waitUntil(cache.put(cacheKey, response.clone()))
    }
  }
  response.headers.set('Content-Type', mimeType)
  response.headers.set('Cache-Control', `max-age=${options.cacheControl.browserTTL}`)
  return response
}

export { getAssetFromKV, defaultKeyModifier }
