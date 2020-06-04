import * as mime from 'mime'
import { Options, CacheControl, MethodNotAllowedError, NotFoundError, InternalError } from './types'

declare global {
  var __STATIC_CONTENT: any, __STATIC_CONTENT_MANIFEST: string
}
/**
 * maps the path of incoming request to the request pathKey to look up
 * in bucket and in cache
 * e.g.  for a path '/' returns '/index.html' which serves
 * the content of bucket/index.html
 * @param {Request} request incoming request
 */
const mapRequestToAsset = (request: Request) => {
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
  return new Request(parsedUrl.toString(), request)
}

/**
 * maps the path of incoming request to /index.html if it evaluates to
 * any html file.
 * @param {Request} request incoming request
 */
function serveSinglePageApp(request: Request): Request {
  // First apply the default handler, which already has logic to detect
  // paths that should map to HTML files.
  request = mapRequestToAsset(request)

  const parsedUrl = new URL(request.url)

  // Detect if the default handler decided to map to
  // a HTML file in some specific directory.
  if (parsedUrl.pathname.endsWith('.html')) {
    // If expected HTML file was missing, just return the root index.html
    return new Request(`${parsedUrl.origin}/index.html`, request)
  } else {
    // The default handler decided this is not an HTML page. It's probably
    // an image, CSS, or JS file. Leave it as-is.
    return request
  }
}

const defaultCacheControl: CacheControl = {
  browserTTL: null,
  edgeTTL: 2 * 60 * 60 * 24, // 2 days
  bypassCache: false, // do not bypass Cloudflare's cache
}

/**
 * takes the path of the incoming request, gathers the approriate cotent from KV, and returns
 * the response
 *
 * @param {FetchEvent} event the fetch event of the triggered request
 * @param {{mapRequestToAsset: (string: Request) => Request, cacheControl: {bypassCache:boolean, edgeTTL: number, browserTTL:number}, ASSET_NAMESPACE: any, ASSET_MANIFEST:any}} [options] configurable options
 * @param {CacheControl} [options.cacheControl] determine how to cache on Cloudflare and the browser
 * @param {typeof(options.mapRequestToAsset)} [options.mapRequestToAsset]  maps the path of incoming request to the request pathKey to look up
 * @param {Object | string} [options.ASSET_NAMESPACE] the binding to the namespace that script references
 * @param {any} [options.ASSET_MANIFEST] the map of the key to cache and store in KV
 * */
const getAssetFromKV = async (event: FetchEvent, options?: Partial<Options>): Promise<Response> => {
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
  const ASSET_MANIFEST = typeof (options.ASSET_MANIFEST) === 'string'
    ? JSON.parse(options.ASSET_MANIFEST)
    : options.ASSET_MANIFEST

  if (typeof ASSET_NAMESPACE === 'undefined') {
    throw new InternalError(`there is no KV namespace bound to the script`)
  }

  const SUPPORTED_METHODS = ['GET', 'HEAD']
  if (!SUPPORTED_METHODS.includes(request.method)) {
    throw new MethodNotAllowedError(`${request.method} is not a valid request method`)
  }

  const rawPathKey = decodeURIComponent(new URL(request.url).pathname.replace(/^\/+/, '')) // strip any preceding /'s
  //set to the raw file if exists, else the approriate HTML file
  const requestKey = ASSET_MANIFEST[rawPathKey] ? request : options.mapRequestToAsset(request)
  const parsedUrl = new URL(requestKey.url)
  const pathname = decodeURIComponent(parsedUrl.pathname) // decode percentage encoded path

  // pathKey is the file path to look up in the manifest
  let pathKey = pathname.replace(/^\/+/, '') // remove prepended /

  // @ts-ignore
  const cache = caches.default
  let mimeType = mime.getType(pathKey) || 'text/plain'
  if (mimeType.startsWith('text')) {
      mimeType += '; charset=utf8'
  }

  let shouldEdgeCache = false // false if storing in KV by raw file path i.e. no hash
  // check manifest for map from file path to hash
  if (typeof ASSET_MANIFEST !== 'undefined') {
    if (ASSET_MANIFEST[pathKey]) {
      pathKey = ASSET_MANIFEST[pathKey]
      // if path key is in asset manifest, we can assume it contains a content hash and can be cached
      shouldEdgeCache = true
    }
  }

  // TODO this excludes search params from cache, investigate ideal behavior
  let cacheKey = new Request(`${parsedUrl.origin}/${pathKey}`, request)

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
  if (options.cacheControl.bypassCache || options.cacheControl.edgeTTL === null) {
    shouldEdgeCache = false
  }
  // only set max-age if explictly passed in a number as an arg
  const shouldSetBrowserCache = typeof options.cacheControl.browserTTL === 'number'

  let response = null
  if (shouldEdgeCache) {
    response = await cache.match(cacheKey)
  }

  if (response) {
    let headers = new Headers(response.headers)
    if (shouldSetBrowserCache) {
      headers.set('cache-control', `max-age=${options.cacheControl.browserTTL}`)
    } else {
      // don't assume we want same cache behavior of edge TTL on client
      // so remove the header from the response we'll return
      headers.delete('cache-control')
    }

    let shouldRevalidate = false
    // Four preconditions must be met for a 304 Not Modified:
    // - the request cannot be a range request
    // - client sends if-none-match
    // - resource has etag
    // - test if-none-match against the pathKey so that we test against KV, rather than against
    // CF cache, which may modify the etag with a weak validator (e.g. W/"...")
    shouldRevalidate = [
      request.headers.has('range') !== true,
      request.headers.has('if-none-match'),
      response.headers.has('etag'),
      request.headers.get('if-none-match') === `${pathKey}`,
    ].every((val) => val === true)

    if (shouldRevalidate) {
      // TypeError permitted to satisfy mocks per /issues/96
      try {
        // Proactively remove body per /pull/94#discussion_r425455176
        response.body.cancel()
      } catch (e) {
        if (e instanceof TypeError && e.message === 'response.body.cancel is not a function') {
          console.log('Environment doesnt support readable streams')
        }
      }

      headers.set('cf-cache-status', 'REVALIDATED')
      response = new Response(null, {
        status: 304,
        headers,
        statusText: 'Not Modified',
      })
    } else {
      headers.set('CF-Cache-Status', 'HIT')
      response = new Response(response.body, { headers })
    }
  } else {
    const body = await ASSET_NAMESPACE.get(pathKey, 'arrayBuffer')
    if (body === null) {
      throw new NotFoundError(`could not find ${pathKey} in your content namespace`)
    }
    response = new Response(body)

    if (shouldEdgeCache) {
      response.headers.set('Accept-Ranges', 'bytes')
      response.headers.set('Content-Length', body.length)
      // set etag before cache insertion
      if (!response.headers.has('etag')) {
        response.headers.set('etag', `${pathKey}`)
      }
      // determine Cloudflare cache behavior
      response.headers.set('Cache-Control', `max-age=${options.cacheControl.edgeTTL}`)
      event.waitUntil(cache.put(cacheKey, response.clone()))
      response.headers.set('CF-Cache-Status', 'MISS')
    }
  }
  response.headers.set('Content-Type', mimeType)
  if (shouldSetBrowserCache) {
    response.headers.set('Cache-Control', `max-age=${options.cacheControl.browserTTL}`)
  } else {
    response.headers.delete('Cache-Control')
  }
  return response
}

export { getAssetFromKV, mapRequestToAsset, serveSinglePageApp }