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
          cacheKey.headers = {
            'etag': key.headers.get('if-none-match')
          }
          return cacheStore.get(JSON.stringify(cacheKey))
        }
        // if client doesn't send if-none-match, we need to iterate through these keys
        // and just test the URL
        const activeCacheKeys: Array<string> = Array.from(cacheStore.keys())
        for (const cacheStoreKey of activeCacheKeys) {
          if (JSON.parse(cacheStoreKey).url === key.url) {
            return cacheStore.get(cacheStoreKey)
          }
        }
      },
      async put (key: any, val: Response) {
        let headers = new Headers(val.headers)
        let resp = new Response(val.body, { headers })
        let cacheKey: CacheKey = {
          url: key.url,
          headers: {
            'etag': val.headers.get('etag')
          }
        }
        return cacheStore.set(JSON.stringify(cacheKey), resp)
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
