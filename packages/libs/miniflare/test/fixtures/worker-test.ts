import type { Awaitable } from "miniflare:shared";

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

export function createTestHandler(test: () => Awaitable<unknown>) {
	return {
		async fetch() {
			try {
				await test();
				return new Response();
			} catch (e: any) {
				const error = reduceError(e);
				return Response.json(error, {
					status: 500,
					headers: { "MF-Experimental-Error-Stack": "true" },
				});
			}
		},
	};
}
