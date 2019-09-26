import mime from 'mime'

/**
 * maps the path of incoming request to the filepath (key)
  * determine the file path to search for from the pathname of the incoming request
 * e.g.  for a path '/' returns '/index.html'
 *  serve the content of bucket/index.html
 * @param {Request} the incoming request
 */
const defaultRequestModifier = request => {
  const parsedUrl = new URL(request.url)
  let pathname = parsedUrl.pathname

  if (pathname.endsWith('/')) {
    // If path looks like a directory
    // e.g. If path is /about/ -> /about/index.html
    pathname = pathname.concat('index.html')
  } else if (!mime.getType(pathname)) {
    // If path doesn't look like valid content
    //  e.g. /about.me ->  /about.me/index.html
    pathname = pathname.concat('/index.html')
  }

  parsedUrl.pathname = pathname
  return new Request(parsedUrl, request)
}

const defaultCacheControl = {
  browserTTL: 0,
  edgeTTL: 100 * 60 * 60 * 24, // 100 days
  bypassCache: false, // do not bypass Cloudflare's cache
}
/**
 * Cache control Type
 * To cache based on the request this can also be a function that takes in a
 * request and returns this type
 * @typedef {Object} CacheControl
 * @property {boolean} bypassCache
 * @property {number} edgeTTL
 * @property {number} browserTTL
 */

/**
 * takes the path of the incoming request, gathers the approriate cotent from KV, and returns
 * the response
 *
 * @param {event} event the fetch event of the triggered request
 * @param {Objects} [options] configurable options
 * @param {(string: Request) => Request} [options.requestModifier] maps incoming request to a request for filepath (key) that will be looked up from the local bucket.
 * @param {CacheControl} [options.cacheControl] determine how to cache on Cloudflare and the browser
 * @param {any} [options.ASSET_NAMESPACE] the binding to the namespace that script references
 * @param {any} [options.ASSET_MANIFEST] the map of the key to cache and store in KV
 * */
const getAssetFromKV = async (event, options) => {
  // Assign any missing options passed in to the default
  options = Object.assign(
    {
      ASSET_NAMESPACE: __STATIC_CONTENT,
      ASSET_MANIFEST: __STATIC_CONTENT_MANIFEST,
      requestModifier: defaultRequestModifier,
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
  
  // determine the file path to search for based on the incoming request
  const kvRequest = options.requestModifier(request)
  const parsedUrl = new URL(kvRequest.url)

  const pathname = parsedUrl.pathname

  // remove prepended /
  let key = pathname.replace(/^\/+/, '')

  const cache = caches.default
  const mimeType = mime.getType(key) || 'text/plain'

  let shouldEdgeCache = false // false if storing in KV by raw file path i.e. no hash
  // check manifest for map from file path to hash
  if (typeof ASSET_MANIFEST !== 'undefined') {
    if (JSON.parse(ASSET_MANIFEST)[key]) {
      key = JSON.parse(ASSET_MANIFEST)[key]
      shouldEdgeCache = true // cache on edge if content is hashed
    }
  }

  // this excludes search params from cache key
  const cacheKey = `${parsedUrl.origin}/${key}`

  // if argument passed in for cacheControl is a function than
  // evaluate that function. otherwise return the Object passed in
  // or default Object
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
    shouldEdgeCache = false
  }

  let response = null
  if (shouldEdgeCache) {
    response = await cache.match(cacheKey)
  }

  if (response) {
    let headers = new Headers(response.headers)
    headers.set('CF-Cache-Status', 'HIT')
    response = new Response(response.body, { headers })
  } else {
    const body = await __STATIC_CONTENT.get(key, 'arrayBuffer')
    if (body === null) {
      throw new Error(`could not find ${key} in your content namespace`)
    }
    response = new Response(body)

    // TODO: could implement CF-Cache-Status REVALIDATE if path w/o hash existed in manifest

    if (shouldEdgeCache) {
      response.headers.set('CF-Cache-Status', 'MISS')
      // determine Cloudflare cache behavior
      response.headers.set('Cache-Control', `max-age=${options.cacheControl.edgeTTL}`)
      event.waitUntil(cache.put(cacheKey, response.clone()))
      // don't assume we want same cache behavior on client
      // so remove the header from the response we'll return
      response.headers.delete('Cache-Control')
    }
  }
  response.headers.set('Content-Type', mimeType)
  if (options.cacheControl.browserTTL) {
    response.headers.set('Cache-Control', `max-age=${options.cacheControl.browserTTL}`)
  }
  return response
}

export { getAssetFromKV, defaultRequestModifier }
