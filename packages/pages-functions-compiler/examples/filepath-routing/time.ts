import { RequestHandler } from '../../public'

export const getTime: RequestHandler = async (context) => {
  const date = new Date().toISOString()
  return new Response(date)
}

export const onRequest = getTime
