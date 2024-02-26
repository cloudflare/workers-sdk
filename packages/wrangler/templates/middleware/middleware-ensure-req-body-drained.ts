import type { Middleware } from "./common";

const drainBody: Middleware = async (request, env, _ctx, middlewareCtx) => {
	try {
		return await middlewareCtx.next(request, env);
	} finally {
		if (!request.bodyUsed) {
			_ctx.waitUntil(request.arrayBuffer());
		}
	}
};

export default drainBody;
export const wrap = undefined;
