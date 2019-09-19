const makeServiceWorkerEnv = require('service-worker-mock')

const HASH = '123-I-AM-A-HASH-BROWN'

export const mockKV = () => {
  const store = {
    'https://blah.com/key1.txt-123-I-AM-A-HASH-BROWN': 'val1',
    'https://blah.com/index.html-123-I-AM-A-HASH-BROWN': 'index.html',
  }
  return {
    get: path => store[path] || null,
  }
}

export const mockManifest = () => {
  return {
    'key1.txt': `key1.txt-${HASH}`,
    'index.html': `index.html-${HASH}`,
  }
}

export const mockCaches = () => {
  const store = { 'https://blah.com/key1.txt-123-I-AM-A-HASH-BROWN': 'val1' }
  return {
    default: { match: () => null },
  }
}
export function mockGlobal() {
  Object.assign(global, makeServiceWorkerEnv())
  Object.assign(global, { __STATIC_CONTENT_MANIFEST: mockManifest() })
  Object.assign(global, { __STATIC_CONTENT: mockKV() })
  Object.assign(global, { caches: mockCaches() })
}
