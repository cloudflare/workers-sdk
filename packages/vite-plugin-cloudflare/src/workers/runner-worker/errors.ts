// Note: the approach used here has the following implications:
// - Errors that occur in named entrypoints, auxiliary Workers etc. will display in stack traces as occurring in the default export of the entry Worker
// - If an error occurs in a named entrypoint or auxiliary Worker and the `fetch` handler in the default export of the entry Worker returns the response from the binding directly then the stack trace will be incorrect

/**
 * Converts an error to an object that can be be serialized and revived by Miniflare.
 * Copied from `packages/wrangler/templates/middleware/middleware-miniflare3-json-error.ts`
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function reduceError(e: any): any {
	return {
		name: e?.name,
		message: e?.message ?? String(e),
		stack: e?.stack,
		cause: e?.cause === undefined ? undefined : reduceError(e.cause),
	};
}

/**
 * Captures errors in the `fetch` handler of the default export of the entry Worker.
 * These are returned as a JSON response that is revived by Miniflare.
 * See comment in `/packages/wrangler/src/deployment-bundle/bundle.ts` for more info.
 */
export async function maybeCaptureError<T>(
	options: { isEntryWorker: boolean; key: string; exportName: string },
	fn: () => T
) {
	if (
		!options.isEntryWorker ||
		options.exportName !== "default" ||
		options.key !== "fetch"
	) {
		return fn();
	}

	try {
		return await fn();
	} catch (error) {
		return Response.json(reduceError(error), {
			status: 500,
			headers: { "MF-Experimental-Error-Stack": "true" },
		});
	}
}
