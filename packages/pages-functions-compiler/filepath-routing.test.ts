import path from 'path'
import { compareRoutes, generateConfigFromFileTree } from './filepath-routing'
import mock from 'mock-fs'

describe('generateConfigFromFileTree()', () => {
  beforeEach(() => {
    mock({
      '/functions': {
        api: {
          'hello.ts': 'export const onRequestGet = () => new Response("Hello from an API!");'
        },
        'index.ts': 'export const onRequest = () => new Response("Hello, world!");',
        '_middleware.ts':
          'export const onRequest = [async () => new Response("Hello from middleware!")];'
      },
      node_modules: mock.load(path.resolve(__dirname, './node_modules'))
    })
  })

  afterEach(() => {
    mock.restore()
  })

  test('it merges and sorts route entries', async () => {
    const result = await generateConfigFromFileTree({ baseURL: '/', baseDir: '/functions' })
    expect(result.routes).toEqual({
      '/': {
        middleware: ['_middleware.ts:onRequest'],
        module: ['index.ts:onRequest']
      },
      'GET /api/hello': {
        module: ['api/hello.ts:onRequestGet']
      }
    })
  })
})

describe('compareRoutes()', () => {
  test('routes with fewer segments come after those with more segments', () => {
    expect(compareRoutes('/foo', '/foo/bar')).toBe(1)
  })

  test('routes with wildcard segments come after those without', () => {
    expect(compareRoutes('/:foo*', '/foo')).toBe(1)
    expect(compareRoutes('/:foo*', '/:foo')).toBe(1)
  })

  test('routes with dynamic segments come after those without', () => {
    expect(compareRoutes('/:foo', '/foo')).toBe(1)
  })

  test('routes with dynamic segments occuring earlier come after those with dynamic segments in later positions', () => {
    expect(compareRoutes('/foo/:id/bar', '/foo/bar/:id')).toBe(1)
  })

  test('routes with no HTTP method come after those specifying a method', () => {
    expect(compareRoutes('/foo', 'GET /foo')).toBe(1)
  })

  test('two equal routes are sorted according to their original position in the list', () => {
    expect(compareRoutes('GET /foo', 'GET /foo')).toBe(0)
  })

  test('it returns -1 if the first argument should appear first in the list', () => {
    expect(compareRoutes('GET /foo', '/foo')).toBe(-1)
  })
})
