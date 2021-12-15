import path from 'path'
import fs from 'fs/promises'
import { transform } from 'esbuild'
import * as acorn from 'acorn'
import * as acornWalk from 'acorn-walk'
import { Config } from './routes'
import { Identifier } from 'estree'
import { ExportNamedDeclaration } from '@babel/types'

type Arguments = {
  baseDir: string
  baseURL: string
}

export async function generateConfigFromFileTree({ baseDir, baseURL }: Arguments) {
  let routeEntries: [string, { [key in 'module' | 'middleware']?: string[] }][] = [] as any

  if (!baseURL.startsWith('/')) {
    baseURL = `/${baseURL}`
  }

  if (baseURL.endsWith('/')) {
    baseURL = baseURL.slice(0, -1)
  }

  await forEachFile(baseDir, async (filepath) => {
    const ext = path.extname(filepath)
    if (/\.(mjs|js|ts)/.test(ext)) {
      // transform the code to ensure we're working with vanilla JS + ESM
      const { code } = await transform(await fs.readFile(filepath, 'utf-8'), {
        loader: ext === '.ts' ? 'ts' : 'js',
      })

      // parse each file into an AST and search for module exports that match "onRequest" and friends
      const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' })
      acornWalk.simple(ast, {
        ExportNamedDeclaration(_node) {
          const node: ExportNamedDeclaration = _node as any

          // this is an array because multiple things can be exported from a single statement
          // i.e. `export {foo, bar}` or `export const foo = "f", bar = "b"`
          let exportNames: string[] = []

          if (node.declaration) {
            const declaration = node.declaration

            // `export async function onRequest() {...}`
            if (declaration.type === 'FunctionDeclaration') {
              exportNames.push(declaration.id.name)
            }

            // `export const onRequestGet = () => {}, onRequestPost = () => {}`
            if (declaration.type === 'VariableDeclaration') {
              exportNames.push(
                ...declaration.declarations.map(
                  (variableDeclarator) => ((variableDeclarator.id as unknown) as Identifier).name
                )
              )
            }
          }

          // `export {foo, bar}`
          if (node.specifiers.length) {
            exportNames.push(
              ...node.specifiers.map(
                (exportSpecifier) => ((exportSpecifier.exported as unknown) as Identifier).name
              )
            )
          }

          for (const exportName of exportNames) {
            const [match, method] =
              exportName.match(/^onRequest(Get|Post|Put|Patch|Delete|Options|Head)?$/) ?? []

            if (match) {
              const basename = path.basename(filepath).slice(0, -ext.length)

              const isIndexFile = basename === 'index'
              // TODO: deprecate _middleware_ in favor of _middleware
              const isMiddlewareFile = basename === '_middleware' || basename === '_middleware_'

              let routePath = path.relative(baseDir, filepath).slice(0, -ext.length)

              if (isIndexFile || isMiddlewareFile) {
                routePath = path.dirname(routePath)
              }

              if (routePath === '.') {
                routePath = ''
              }

              routePath = `${baseURL}/${routePath}`

              routePath = routePath.replace(/\[\[(.+)]]/g, ':$1*') // transform [[id]] => :id*
              routePath = routePath.replace(/\[(.+)]/g, ':$1') // transform [id] => :id

              if (method) {
                routePath = `${method.toUpperCase()} ${routePath}`
              }

              routeEntries.push([
                routePath,
                {
                  [isMiddlewareFile ? 'middleware' : 'module']: [
                    `${path.relative(baseDir, filepath)}:${exportName}`,
                  ],
                },
              ])
            }
          }
        },
      })
    }
  })

  // Combine together any routes (index routes) which contain both a module and a middleware
  routeEntries = routeEntries.reduce((acc: typeof routeEntries, [routePath, routeHandler]) => {
    const existingRouteEntry = acc.find(routeEntry => routeEntry[0] === routePath)
    if (existingRouteEntry !== undefined) {
      existingRouteEntry[1] = {
        ...existingRouteEntry[1],
        ...routeHandler
      }
    } else {
      acc.push([routePath, routeHandler])
    }
    return acc
  }, [])

  routeEntries.sort(([pathA], [pathB]) => compareRoutes(pathA, pathB))

  return { routes: Object.fromEntries(routeEntries) } as Config
}

// Ensure routes are produced in order of precedence so that
// more specific routes aren't occluded from matching due to
// less specific routes appearing first in the route list.
export function compareRoutes(a: string, b: string) {
  function parseRoutePath(routePath: string) {
    let [method, path] = routePath.split(' ')
    if (!path) {
      path = method
      method = null
    }

    const segments = path.slice(1).split('/')
    return [method, segments]
  }

  const [methodA, segmentsA] = parseRoutePath(a)
  const [methodB, segmentsB] = parseRoutePath(b)

  // sort routes with fewer segments after those with more segments
  if (segmentsA.length !== segmentsB.length) {
    return segmentsB.length - segmentsA.length
  }

  for (let i = 0; i < segmentsA.length; i++) {
    const isWildcardA = segmentsA[i].includes('*')
    const isWildcardB = segmentsB[i].includes('*')
    const isParamA = segmentsA[i].includes(':')
    const isParamB = segmentsB[i].includes(':')

    // sort wildcard segments after non-wildcard segments
    if (isWildcardA && !isWildcardB) return 1
    if (!isWildcardA && isWildcardB) return -1

    // sort dynamic param segments after non-param segments
    if (isParamA && !isParamB) return 1
    if (!isParamA && isParamB) return -1
  }

  // sort routes that specify an HTTP before those that don't
  if (methodA && !methodB) return -1
  if (!methodA && methodB) return 1

  // all else equal, just sort them lexicographically
  return a.localeCompare(b)
}

async function forEachFile<T>(baseDir: string, fn: (filepath: string) => T | Promise<T>) {
  const searchPaths = [baseDir]
  const returnValues: T[] = []

  while (searchPaths.length) {
    let cwd = searchPaths.shift()
    const dir = await fs.readdir(cwd, { withFileTypes: true })
    for (const entry of dir) {
      const pathname = path.join(cwd, entry.name)
      if (entry.isDirectory()) {
        searchPaths.push(pathname)
      } else if (entry.isFile()) {
        returnValues.push(await fn(pathname))
      }
    }
  }

  return returnValues
}
