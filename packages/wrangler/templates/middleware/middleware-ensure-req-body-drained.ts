import type { Middleware } from "./common";

const drainBody: Middleware = async (request, env, _ctx, middlewareCtx) => {
	try {
		return await middlewareCtx.next(request, env);
	} finally {
		try {
			console.log("drainBody middleware");
			if (request.body !== null && !request.bodyUsed) {
				console.log("!bodyUsed");
				const reader = request.body.getReader();
				while (!(await reader.read()).done) {}
			}
		} catch (e) {
			console.error("Failed to drain the unused request body.", e);
		}
	}
};

export default drainBody;
