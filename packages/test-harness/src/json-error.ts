import path from "node:path";
import type { WorkerOptions } from "miniflare";

type Manifest = NonNullable<WorkerOptions["config"]["manifest"]>;

/**
 * Wraps a Worker's default `fetch()` handler so an uncaught error rejects
 * Miniflare's `dispatchFetch()` with that error. Wrangler's harness gets this
 * from the `miniflare3-json-error` middleware its bundler adds in development;
 * a production build doesn't have it.
 *
 * @param manifest The Worker's module manifest
 * @returns The manifest, with a wrapper as its main module
 */
export function withJsonErrors(manifest: Manifest): Manifest {
	if (manifest.modules[manifest.mainModule]?.type !== "esm") {
		// Only an ES main module can be re-exported by the wrapper
		return manifest;
	}

	const mainModule = path.posix.join(
		path.posix.dirname(manifest.mainModule),
		"__test-harness-entry__.mjs"
	);
	return {
		...manifest,
		mainModule,
		modules: {
			...manifest.modules,
			[mainModule]: {
				type: "esm",
				contents: getEntryModule(
					`./${path.posix.basename(manifest.mainModule)}`
				),
			},
		},
	};
}

/**
 * @param specifier The Worker's main module, relative to the wrapper
 * @returns The wrapper module's source
 */
function getEntryModule(specifier: string): string {
	return `import * as worker from ${JSON.stringify(specifier)};

export * from ${JSON.stringify(specifier)};

// Copied from Wrangler's templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
	return {
		name: e?.name,
		message: e?.message ?? String(e),
		stack: e?.stack,
		cause: e?.cause === undefined ? undefined : reduceError(e.cause),
	};
}

async function jsonError(next) {
	try {
		return await next();
	} catch (e) {
		const error = reduceError(e);
		const body = JSON.stringify(error);
		const headers = {
			"Content-Type": "application/json",
			"MF-Experimental-Error-Stack": "true",
		};
		// \`workerd\` drops response bodies for \`HEAD\` requests, so also carry the
		// serialised error in a header. Past roughly 16KB of encoded header the
		// runtime drops the whole response, so stay well under that; the body
		// remains the primary channel for every method that keeps one.
		const encoded = encodeURIComponent(body);
		if (encoded.length <= 8192) {
			headers["MF-Experimental-Error-Stack-Payload"] = encoded;
		}
		return new Response(body, { status: 500, headers });
	}
}

// Wraps the default export as Wrangler's templates/middleware/loader-modules.ts does
// A module without a default export behaves as a Vite build of it does
const ENTRY = worker.default ?? {};
let WRAPPED_ENTRY = ENTRY;
if (typeof ENTRY === "object" && ENTRY !== null) {
	WRAPPED_ENTRY = {
		...ENTRY,
		fetch(request, env, ctx) {
			return jsonError(() => {
				if (ENTRY.fetch === undefined) {
					throw new Error("Handler does not export a fetch() function.");
				}
				return ENTRY.fetch(request, env, ctx);
			});
		},
	};
} else if (typeof ENTRY === "function") {
	// \`extend\`ing \`ENTRY\` here so other RPC methods remain callable
	WRAPPED_ENTRY = class extends ENTRY {
		fetch(request) {
			return jsonError(() => {
				if (super.fetch === undefined) {
					throw new Error("Entrypoint class does not define a fetch() function.");
				}
				return super.fetch(request);
			});
		}
	};
}
export default WRAPPED_ENTRY;
`;
}
