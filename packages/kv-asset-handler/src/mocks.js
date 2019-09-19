const makeServiceWorkerEnv = require('service-worker-mock')

export const mockKV = () => {
  const store = {
    'https://blah.com/key1.txt': 'val1',
    'https://blah.com/index.html': 'index.html',
  }
  return {
    get: path => store[path] || null,
  }
}
export const mockCaches = () => {
  const store = { 'https://blah.com/key1.txt': 'val1' }
  return {
    default: { match: () => null },
  }
}
export function mockGlobal() {
  Object.assign(global, makeServiceWorkerEnv())
  Object.assign(global, { __STATIC_CONTENT: mockKV() })
  Object.assign(global, { caches: mockCaches() })
}
