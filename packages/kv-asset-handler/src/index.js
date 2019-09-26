import mime from 'mime'

/**
 * maps the path of incoming request to the request pathKey to look up
 * in bucket and in cache
 * e.g.  for a path '/' returns '/index.html' which serves
 * the content of bucket/index.html
 * @param {Request} request incoming request
 */
const mapRequestToAsset = request => {
  const parsedUrl = new URL(request.url)
  let pathname = parsedUrl.pathname

  if (pathname.endsWith('/')) {
    // If path looks like a directory append index.html
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
 * takes the path of the incoming request, gathers the approriate cotent from KV, and returns
 * the response
 *
 * @param {event} event the fetch event of the triggered request
 * @param {{mapRequestToAsset: (string: Request) => Request, cacheControl: {bypassCache:boolean, edgeTTL: number, browserTTL:number}, ASSET_NAMESPACE: any, ASSET_MANIFEST:any}} [options] configurable options
 * @param {CacheControl} [options.cacheControl] determine how to cache on Cloudflare and the browser
 * @param {typeof(options.mapRequestToAsset)} [options.mapRequestToAsset]  maps the path of incoming request to the request pathKey to look up
 * @param {any} [options.ASSET_NAMESPACE] the binding to the namespace that script references
 * @param {any} [options.ASSET_MANIFEST] the map of the key to cache and store in KV
 * */
const getAssetFromKV = async (event, options) => {
  // Assign any missing options passed in to the default
  options = Object.assign(
    {
      ASSET_NAMESPACE: __STATIC_CONTENT,
      ASSET_MANIFEST: __STATIC_CONTENT_MANIFEST,
      mapRequestToAsset: mapRequestToAsset,
      cacheControl: defaultCacheControl,
    },
    options,
  )

  const request = event.request
  const ASSET_NAMESPACE = options.ASSET_NAMESPACE
  const ASSET_MANIFEST = options.ASSET_MANIFEST

  const SUPPORTED_METHODS = ["GET", "HEAD"]

  if (!SUPPORTED_METHODS.includes(request.method)) {
    throw new Error(`${request.method} is not a valid request method`)
  }

  if (typeof ASSET_NAMESPACE === 'undefined') {
    throw new Error(`there is no ${ASSET_NAMESPACE} namespace bound to the script`)
  }

  // determine the requestKey based on the actual file served for the incoming request
  const requestKey = options.mapRequestToAsset(request)
  const parsedUrl = new URL(requestKey.url)

  const pathname = parsedUrl.pathname

  // pathKey is the file path to look up in the manifest
  let pathKey = pathname.replace(/^\/+/, '') // remove prepended /

  const cache = caches.default
  const mimeType = mime.getType(pathKey) || 'text/plain'

  let shouldEdgeCache = false // false if storing in KV by raw file path i.e. no hash
  // check manifest for map from file path to hash
  if (typeof ASSET_MANIFEST !== 'undefined') {
    if (JSON.parse(ASSET_MANIFEST)[pathKey]) {
      pathKey = JSON.parse(ASSET_MANIFEST)[pathKey]
      shouldEdgeCache = true // cache on edge if pathKey is a unique hash
    }
  }

  // TODO cacheKey should be a request and this excludes search params from cache
  const cacheKey = `${parsedUrl.origin}/${pathKey}`

  // if argument passed in for cacheControl is a function then
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
    const body = await __STATIC_CONTENT.get(pathKey, 'arrayBuffer')
    if (body === null) {
      throw new Error(`could not find ${pathKey} in your content namespace`)
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

export { getAssetFromKV, mapRequestToAsset }
