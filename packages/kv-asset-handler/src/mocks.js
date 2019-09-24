const makeServiceWorkerEnv = require('service-worker-mock')

const HASH = '123HASHBROWN'

export const mockKV = () => {
  const store = {
    'key1.123HASHBROWN.txt': 'val1',
    'key1.123HASHBROWN.png': 'val1',
    'index.123HASHBROWN.html': 'index.html',
    'sub/blah.123HASHBROWN.png': 'picturedis',
  }
  return {
    get: path => store[path] || null,
  }
}

export const mockManifest = () => {
  return JSON.stringify({
    'key1.txt': `key1.${HASH}.txt`,
    'key1.png': `key1.${HASH}.png`,
    'index.html': `index.${HASH}.html`,
    'sub/blah.png': `sub/blah.${HASH}.png`,
  })
}

export const mockCaches = () => {
  const store = { 'https://blah.com/key1.123HASHBROWN.txt': 'val1' }
  return {
    default: {
      match: () => null,
      put: a => {},
    },
  }
}

export function mockGlobal() {
  Object.assign(global, makeServiceWorkerEnv())
  Object.assign(global, { __STATIC_CONTENT_MANIFEST: mockManifest() })
  Object.assign(global, { __STATIC_CONTENT: mockKV() })
  Object.assign(global, { caches: mockCaches() })
}
