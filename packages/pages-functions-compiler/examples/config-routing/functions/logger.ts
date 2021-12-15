import { RequestHandler } from '../../../public'

export const logger: RequestHandler = async ({ request, next }) => {
  const timeIn = new Date()
  const response = await next()
  const timeOut = new Date()

  const responseTime = Number(timeOut) - Number(timeIn)
  console.log(`[${timeIn.toISOString()}] ${request.method} ${request.url} - ${responseTime}ms`)

  return response
}

export default logger
