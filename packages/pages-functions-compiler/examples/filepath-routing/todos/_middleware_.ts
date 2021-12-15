import { RequestHandler } from '../../../public'

function verifyJWT(authHeader: string) {
  return true
}
function parseJWT(authHeader: string) {
  return {
    id: 1,
  }
}

const auth: RequestHandler = async ({ request, next, data }) => {
  const authHeader = request.headers.get('Authorization')

  if (verifyJWT(authHeader)) {
    data.user = parseJWT(authHeader)
    return await next()
  }

  return new Response('Not Authorized', { status: 401 })
}

export const onRequestPost = auth
export const onRequestPut = [auth]
export const onRequestPatch = [auth]
export const onRequestDelete = [auth]

// Could define an empty array here to prevent someone accidentally adding one in future, e.g:
export const onRequestGet = [
  /* NOTE: no auth required as per discussing in JIRA 1234 */
]
