import { RequestHandler } from "../../public"

export const addCORS: RequestHandler = async ({ next }) => {
  const response = await next()
  response.headers.set("Access-Control-Allow-Origin", "*")
  return response
}