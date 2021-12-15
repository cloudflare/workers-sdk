import { RequestHandler } from '../../public'

const logger: RequestHandler = async ({ request, next }) => {
  const timeIn = new Date()
  const response = await next()
  const timeOut = new Date()

  const responseTime = Number(timeOut) - Number(timeIn)
  console.log(`[${timeIn.toISOString()}] ${request.method} ${request.url} - ${responseTime}ms`)

  return response
}

const errorHandler: RequestHandler = async ({ next }) => {
  try {
    return await next()
  } catch (err) {
    return new Response(`${err.message}\n${err.stack}`, { status: 500 })
  }
}

const hello: RequestHandler = async ({ next }) => {
  const response = await next()
  response.headers.set('X-Hello', 'Hello from Pages Functions')
  return response
}

export const onRequest = [logger, errorHandler, hello]
