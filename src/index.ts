import { DtInspector } from './api/inspect.js'
import { CfAccount, CfWorkerInit, CfWorker } from './api/worker.js'

const account: CfAccount = {
  accountId: '...',
  zoneId: '...',
  apiToken: '...'
}

const init: CfWorkerInit = {
  main: {
    name: 'worker.js',
    type: 'commonjs',
    content: `
    addEventListener('fetch', (event) => {
      console.log(
        event.request.method,
        event.request.url,
        new Map([...event.request.headers]),
        event.request.cf)

      event.respondWith(new Response(DATE))
    })`
  },
  variables: {
    DATE: new Date().toISOString()
  }
}

export async function main() {
  const worker: CfWorker = new CfWorker(init, account)
  const inspector: DtInspector = await worker.inspect()
  //inspector.proxyTo(9230)

  for (let i = 0; i < 3; i++) {
    const response: Response = await worker.fetch('/hello')
    const { status, statusText } = response
    const body = await response.text()
    console.log('Response:', status, statusText, body.substring(0, 100))
  }

  /*for await (const event of inspector.drain()) {
    console.log('Event:', event)
  }
  inspector.close()*/
}
