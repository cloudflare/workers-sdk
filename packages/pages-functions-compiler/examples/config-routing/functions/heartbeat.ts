import { RequestHandler } from "../../public"

const heartbeat: RequestHandler = (context) => {
  return new Response(null, {status: 200})
}

export default heartbeat