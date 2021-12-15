import { RequestHandler } from '../../../public'

export const hello: RequestHandler = async ({ next }) => {
  const response = await next()
  response.headers.set('X-Hello', 'Hello from Pages Functions')
  return response
}

export default hello
