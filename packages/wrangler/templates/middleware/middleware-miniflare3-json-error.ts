import type { Middleware } from "./common";

interface JsonError {
	message?: string;
	name?: string;
	stack?: string;
	cause?: JsonError;
}

function reduceError(e: any): JsonError {
	return {
		name: e?.name,
		message: e?.message ?? String(e),
		stack: e?.stack,
		cause: e?.cause === undefined ? undefined : reduceError(e.cause),
	};
}

// See comment in `bundle.ts` for details on why this is needed
const jsonError: Middleware = async (request, env, _ctx, middlewareCtx) => {
	try {
		return await middlewareCtx.next(request, env);
	} catch (e: any) {
		const error = reduceError(e);
		return Response.json(error, {
			status: 500,
			headers: { "MF-Experimental-Error-Stack": "true" },
		});
	}
};

export default jsonError;
export const wrap = undefined;
