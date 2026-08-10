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
		const body = JSON.stringify(error);
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			"MF-Experimental-Error-Stack": "true",
		};
		// `workerd` drops response bodies for `HEAD` requests, so also carry the
		// serialised error in a header. Past roughly 16KB of encoded header the
		// runtime drops the whole response, so stay well under that; the body
		// remains the primary channel for every method that keeps one.
		const encoded = encodeURIComponent(body);
		if (encoded.length <= 8192) {
			headers["MF-Experimental-Error-Stack-Payload"] = encoded;
		}
		return new Response(body, { status: 500, headers });
	}
};

export default jsonError;
