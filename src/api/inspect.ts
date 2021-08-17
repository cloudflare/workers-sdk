import { FetchServer, proxyWebSocket } from '../util/fetch.js'
import { bind } from '../util/fetch_node.js'

/**
 * A call frame.
 *
 * @link https://chromedevtools.github.io/devtools-protocol/1-3/Runtime/#type-CallFrame
 */
export interface DtCallFrame {
  /**
   * The module path.
   *
   * @example
   * 'worker.js'
   */
  url: string
  /**
   * The function name.
   */
  functionName?: string
  /**
   * The line number. (0-based)
   */
  lineNumber: number
  /**
   * The column number. (0-based)
   */
  columnNumber: number
}

/**
 * A stack trace.
 *
 * @link https://chromedevtools.github.io/devtools-protocol/1-3/Runtime/#type-StackTrace
 */
export interface DtStackTrace {
  /**
   * A description of the stack, only present in certain contexts.
   */
  description?: string
  /**
   * The call frames.
   */
  callFrames: DtCallFrame[]
  /**
   * The parent stack trace.
   */
  parent?: DtStackTrace
}

/**
 * A JavaScript object type.
 */
export type DtRemoteObjectType = 'object' | 'function' | 'undefined' | 'string' | 'number' | 'boolean' | 'symbol' | 'bigint'

/**
 * A view of a remote JavaScript object.
 *
 * @link https://chromedevtools.github.io/devtools-protocol/1-3/Runtime/#type-RemoteObject
 */
export interface DtRemoteObject<T> {
  /**
   * The object type.
   *
   * @example
   * 'string'
   */
  type: DtRemoteObjectType
  /**
   * The specific object type, if the type is `object`.
   *
   * @example
   * 'arraybuffer'
   */
  subtype?: string
  /**
   * The class name, if the type if `object`.
   */
  className?: string
  /**
   * The object as a string.
   *
   * @example
   * 'Array(1)'
   * 'TypeError: Oops!\n    at worker.js:5:15'
   */
  description?: string
  /**
   * The object.
   */
  value?: T
  // TODO(soon): add a preview field for more complex types
}

/**
 * An event when `console.log()` is invoked.
 *
 * @link https://chromedevtools.github.io/devtools-protocol/1-3/Runtime/#event-consoleAPICalled
 */
export interface DtLogEvent {
  timestamp: number,
  type: string,
  args: DtRemoteObject<unknown>[],
  stackTrace?: DtStackTrace
}

/**
 * An event when an uncaught `Error` is thrown.
 *
 * @link https://chromedevtools.github.io/devtools-protocol/1-3/Runtime/#event-exceptionThrown
 */
export interface DtExceptionEvent {
  timestamp: number,
  exceptionDetails: {
    lineNumber: number
    columnNumber: number
    exception: DtRemoteObject<Error>,
    stackTrace: DtStackTrace
  }
}

/**
 * A DevTools event.
 */
export type DtEvent =
  | DtLogEvent
  | DtExceptionEvent

/**
 * A listener that receives DevTools events.
 */
export type DtListener = (event: DtEvent) => void

interface DtProtocolRequest<T> {
  id: number
  method: string
  params?: T
}

interface DtProtocolResponse<T> {
  id: number
  result: T
}

/**
 * A DevTools inspector that listens to logs and debug events from a Worker.
 *
 * @example
 * const worker: CfWorker
 * const inspector: DtInspector = await worker.inspect()
 * 
 * @link https://chromedevtools.github.io/devtools-protocol/
 */
export class DtInspector {
  #webSocket: WebSocket
  #keepAlive?: NodeJS.Timer
  #events: DtEvent[]
  #listeners: DtListener[]
  
  constructor(url: string) {
    this.#events = []
    this.#listeners = []
    this.#webSocket = new WebSocket(url)
    this.#webSocket.onopen = () => this.enable()
    this.#webSocket.onclose = () => this.disable()
    this.#webSocket.onmessage = (event) => this.recv(JSON.parse(event.data))
  }

  /**
   * Pipes events to a listener.
   */
  pipeTo(listener: DtListener): void {
    this.#listeners.push(listener)
  }

  /**
   * Exposes a websocket proxy on a localhost port.
   */
  proxyTo(port: number): void {
    bind(new DtInspectorBridge(this.#webSocket, port), port)
  }

  /**
   * Blocks until the next event is read.
   */
  async read(retries = 5): Promise<DtEvent> {
    const event = this.#events.shift()
    if (event) {
      return event
    }

    if (retries <= 0) {
      throw new Error('Inspector has no events')
    }

    return new Promise((resolve, reject) => {
      const timeout = Math.random() * 10
      setTimeout(() => this.read(retries - 1)
        .then(resolve)
        .catch(reject), timeout)
    })
  }

  /**
   * The underlying `WebSocket` of the inspector.
   */
   get webSocket(): WebSocket {
    return this.#webSocket
  }

  /**
   * If the inspector is closed.
   */
  get closed(): boolean {
    return this.#webSocket.readyState === WebSocket.CLOSED
  }

  /**
   * Drains the backlog of messages.
   */
  async *drain(): AsyncGenerator<DtEvent, number, DtEvent> {
    let backlog = -1

    while (backlog++) {
      try {
        yield await this.read()
      } catch {
        break
      }
    }

    return backlog
  }

  /**
   * Closes the inspector.
   */
  close(): void {
    if (!this.closed) {
      this.#webSocket.close()
    }
    this.#events = []
  }

  private send(event: Record<string, unknown>): void {
    if (!this.closed) {
      this.#webSocket.send(JSON.stringify(event))
    }
  }

  private recv(data: Record<string, unknown>): void {
    const { method, params } = data
    switch (method) {
      case 'Runtime.consoleAPICalled':
      case 'Runtime.exceptionThrown':
        break
      default:
        return
    }

    const event = params as DtEvent
    for (const listener of this.#listeners) {
      listener(event)
    }

    if (this.#events.length > 1000) {
      throw new Error('Too many messages on inspector queue; use read() or drain()')
    }
    this.#events.push(event)
  }

  private enable(): void {
    let id = 1
    this.send({ method: 'Runtime.enable', id })
    this.#keepAlive = setInterval(() => {
      this.send({ method: 'Runtime.getIsolateId', id: id++  })
    }, 10_000)
  }

  private disable(): void {
    if (this.#keepAlive) {
      clearInterval(this.#keepAlive)
      this.#keepAlive = undefined
    }
  }
}

/**
 * A bridge between a remote DevTools inspector and Chrome.
 *
 * Exposes a localhost HTTP server that responds to informational requests
 * from Chrome about the DevTools inspector. Then, when it receives a
 * WebSocket upgrade, forwards the connection to the remote inspector.
 */
class DtInspectorBridge implements FetchServer {
  #webSocket: WebSocket
  #localPort: number
  #connected: boolean

  constructor(webSocket: WebSocket, localPort?: number) {
    this.#webSocket = webSocket
    this.#localPort = localPort
    this.#connected = false
  }

  async fetch(request: Request): Promise<Response> {
    const { url } = request
    const { pathname } = new URL(url)
    switch (pathname) {
      case '/json/version':
        return this.version
      case '/json':
      case '/json/list':
        return this.location
    }
    return new Response('Not Found', { status: 404 })
  }

  upgrade(webSocket: WebSocket): void {
    console.log('Upgrade')
    if (this.#connected) {
      webSocket.close(1013, 'Too many clients; only one can be connected at a time')
    } else {
      console.log('Proxy')
      this.#connected = true
      webSocket.addEventListener('close', () => this.#connected = false)
      proxyWebSocket(webSocket, this.#webSocket)
    }
  }

  private get version(): Response {
    const headers = { 'Content-Type': 'application/json' }
    const body = {
      'Browser': 'workers-cli/1.0',
      // TODO(someday): The DevTools protocol should match that of edgeworker.
      // This could be exposed by the preview API.
      'Protocol-Version': '1.3'
    }
    return new Response(JSON.stringify(body), { headers })
  }

  private get location(): Response {
    const headers = { 'Content-Type': 'application/json' }
    const localHost = `localhost:${this.#localPort}/ws`
    const devToolsUrl = `devtools://devtools/bundled/{}?experiments=true&v8only=true&ws=${localHost}`
    const body = [{
      id: randomId(),
      type: 'node',
      description: 'workers',
      webSocketDebuggerUrl: `ws://${localHost}`,
      devtoolsFrontendUrl: devToolsUrl.replace('{}', 'js_app.html'),
      devtoolsFrontendUrlCompat: devToolsUrl.replace('{}', 'inspector.html'),
      // Below are fields that are visible in the DevTools UI.
      title: 'Cloudflare Worker',
      faviconUrl: 'https://workers.cloudflare.com/favicon.ico',
      url: 'https://' + new URL(this.#webSocket.url).host
    }]
    return new Response(JSON.stringify(body), { headers })
  }
}

// Credit: https://stackoverflow.com/a/2117523
function randomId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}
