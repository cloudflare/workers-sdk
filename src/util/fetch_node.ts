import fetch, { Request, Headers, Response } from 'node-fetch'
import { FormData, Blob } from 'formdata-node'
import WebSocket, { WebSocketServer } from 'ws'
import { FetchServer } from './fetch.js'
import { createServer, IncomingMessage, ServerResponse } from 'node:http'

export function polyfill() {
  // @ts-ignore
  if (!globalThis.fetch) globalThis.fetch = fetch
  // @ts-ignore
  if (!globalThis.Request) globalThis.Request = Request
  // @ts-ignore
  if (!globalThis.Headers) globalThis.Headers = Headers
  // @ts-ignore
  if (!globalThis.Response) globalThis.Response = Response
  // @ts-ignore
  if (!globalThis.FormData) globalThis.FormData = FormData
  // @ts-ignore
  if (!globalThis.Blob) globalThis.Blob = Blob
  // @ts-ignore
  if (!globalThis.WebSocket) globalThis.WebSocket = WebSocket
}

/**
 * Binds a `FetchServer` to a local port to receive HTTP requests.
 */
export function bind(fetcher: FetchServer, port?: number): AbortController {
  const controller = new AbortController()

  const server = createServer((input: IncomingMessage, output: ServerResponse) =>
    toRequest(input)
      // @ts-ignore
      .then(request => fetcher.fetch(request))
      // @ts-ignore
      .then(response => toResponse(response, output))
      .catch(error => console.error(error)))
  
  if (fetcher.upgrade) {
    const webSocket = new WebSocketServer({ server })
    webSocket.on('connection', (ws: WebSocket) => fetcher.upgrade(ws))
  }

  const socket = server.listen({ port })
  controller.signal.onabort = () => socket.close()
  return controller
}

/**
 * Converts a Node.js request to a Web standard `Request`.
 */
async function toRequest(request: IncomingMessage): Promise<Request> {
  const host = request.headers.host ?? 'localhost'
  const { href } = new URL(request.url, 'http://' + host)

  const { rawHeaders, method } = request
  const headers = new Headers()
  for (let i = 0; i < rawHeaders.length; i += 2) {
    headers.append(rawHeaders[i], rawHeaders[i + 1])
  }

  return new Promise((resolve, reject) => {
    let chunks = []
    request.on('data', chunk => chunks.push(chunk))
    request.on('error', error => reject(error))
    request.on('end', () => {
      const buffer = Buffer.concat(chunks)
      const body = buffer.length === 0 ? undefined : buffer
      resolve(new Request(href, { method, headers, body }))
    })
  })
}

/**
 * Converts a Web standard `Response` into a Node.js response.
 */
async function toResponse(input: Response, response: ServerResponse): Promise<void> {
  const { status, statusText, headers, body: hasBody } = input

  for (const [name, value] of headers.entries()) {
    response.setHeader(name, value)
  }

  let body: Uint8Array
  if (hasBody) {
    body = new Uint8Array(await input.arrayBuffer())
    response.setHeader('Content-Length', body.byteLength)
  }

  response.writeHead(status, statusText)
  response.write(body)
}
