import { main } from './index.js'
import { polyfill } from './util/fetch_node.js'

polyfill()

main().catch(cause => {
  const { name, message } = cause
  if (name === 'CloudflareError') {
    console.error('\x1b[31m', message)
    return
  }
  throw cause
})
