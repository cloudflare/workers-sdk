import type { Middleware } from "./common";

const drainBody: Middleware = async (request, env, _ctx, middlewareCtx) => {
	try {
		return await middlewareCtx.next(request, env);
	} finally {
		if (request.body !== null && !request.bodyUsed) {
			const reader = request.body.getReader();
			while (!(await reader.read()).done) {}
		}
	}
};

export default drainBody;
