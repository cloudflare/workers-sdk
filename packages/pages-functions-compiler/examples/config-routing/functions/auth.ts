import { RequestHandler } from "../../public"

function verifyJWT(authHeader: string) { return true }
function parseJWT(authHeader: string) {
  return {
    id: 1
  }
}

export const auth: RequestHandler = async ({request, next, data}) => {
  const authHeader = request.headers.get("Authorization")
  
  if (verifyJWT(authHeader)) {
    data.user = parseJWT(authHeader)
    return await next()
  }

  return new Response("Not Authorized", {status: 401})
}

export default auth