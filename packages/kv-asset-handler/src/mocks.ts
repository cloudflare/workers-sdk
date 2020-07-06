const makeServiceWorkerEnv = require('service-worker-mock')

const HASH = '123HASHBROWN'

export const getEvent = (request: Request): any => {
  const waitUntil = async (callback: any) => {
    await callback
  }
  return {
    request,
    waitUntil,
  }
}
const store: any = {
  'key1.123HASHBROWN.txt': 'val1',
  'key1.123HASHBROWN.png': 'val1',
  'index.123HASHBROWN.html': 'index.html',
  'cache.123HASHBROWN.html': 'cache me if you can',
  '测试.123HASHBROWN.html': 'My filename is non-ascii',
  '%not-really-percent-encoded.123HASHBROWN.html': 'browser percent encoded',
  '%2F.123HASHBROWN.html': 'user percent encoded',
  '你好.123HASHBROWN.html': 'I shouldnt be served',
  '%E4%BD%A0%E5%A5%BD.123HASHBROWN.html': 'Im important',
  'nohash.txt': 'no hash but still got some result',
  'sub/blah.123HASHBROWN.png': 'picturedis',
  'sub/index.123HASHBROWN.html': 'picturedis',
  'client.123HASHBROWN': 'important file',
  'client.123HASHBROWN/index.html': 'Im here but serve my big bro above',
}
export const mockKV = (store: any) => {
  return {
    get: (path: string) => store[path] || null,
  }
}

export const mockManifest = () => {
  return JSON.stringify({
    'key1.txt': `key1.${HASH}.txt`,
    'key1.png': `key1.${HASH}.png`,
    'cache.html': `cache.${HASH}.html`,
    '测试.html': `测试.${HASH}.html`,
    '你好.html': `你好.${HASH}.html`,
    '%not-really-percent-encoded.html': `%not-really-percent-encoded.${HASH}.html`,
    '%2F.html': `%2F.${HASH}.html`,
    '%E4%BD%A0%E5%A5%BD.html': `%E4%BD%A0%E5%A5%BD.${HASH}.html`,
    'index.html': `index.${HASH}.html`,
    'sub/blah.png': `sub/blah.${HASH}.png`,
    'sub/index.html': `sub/index.${HASH}.html`,
    'client': `client.${HASH}`,
    'client/index.html': `client.${HASH}`,
  })
}

let cacheStore: any = new Map()
interface CacheKey {
  url:object;
  headers:object
}
export const mockCaches = () => {
  return {
    default: {
      async match (key: any) {
        let cacheKey: CacheKey = {
          url: key.url,
          headers: {}
        }
        if (key.headers.has('if-none-match')) {
          let makeStrongEtag = key.headers.get('if-none-match').replace('W/', '')
          Reflect.set(cacheKey.headers, 'etag', makeStrongEtag)
        }
        return cacheStore.get(JSON.stringify(cacheKey))
      },
      async put (key: any, val: Response) {
        let headers = new Headers(val.headers)
        let url = new URL(key.url)
        let resWithBody = new Response(val.body, { headers, status: 200 })
        let resNoBody = new Response(null, { headers, status: 304 })
        let cacheKey: CacheKey = {
          url: key.url,
          headers: {
            'etag': `"${url.pathname.replace('/', '')}"`
          }
        }
        cacheStore.set(JSON.stringify(cacheKey), resNoBody)
        cacheKey.headers = {}
        cacheStore.set(JSON.stringify(cacheKey), resWithBody)
        return
      },
    },
  }
}

export function mockGlobal() {
  Object.assign(global, makeServiceWorkerEnv())
  Object.assign(global, { __STATIC_CONTENT_MANIFEST: mockManifest() })
  Object.assign(global, { __STATIC_CONTENT: mockKV(store) })
  Object.assign(global, { caches: mockCaches() })
}
export const sleep = (milliseconds: number) => {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

