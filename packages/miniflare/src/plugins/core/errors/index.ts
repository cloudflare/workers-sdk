import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import { Response } from "../../../http";
import { processStackTrace } from "../../../shared";
import { maybeParseURL } from "../../shared";
import { contentsToString, maybeGetStringScriptPathIndex } from "../modules";
import { getSourceMapper } from "./sourcemap";
import type { Request } from "../../../http";
import type { Log } from "../../../shared";
import type { ParsedWorkerOptions } from "../../shared";
import type { RawSourceMap, UrlAndMap } from "@cspotcode/source-map-support";

// Worker source is provided inline in the config, so stack frames are resolved
// directly against it. There are two forms, with corresponding file specifiers
// reported in workerd stack traces:
//
// - Module workers: `config.manifest.modules` is a record keyed by module path,
//   each with inline `contents`. These are reported as "file://<path>", where
//   `<path>` is the module path resolved against `manifest.modulesRoot` (itself
//   relative to `dev.rootPath` if needed), `dev.rootPath`, or cwd.
// - Service workers: `legacy.serviceWorkerScript` holds the script. If
//   `legacy.serviceWorkerScriptPath` is set, these are reported as
//   "file://<serviceWorkerScriptPath>". Otherwise, they are reported as
//   "<script:n>" for the nth worker (see `buildStringScriptPath`).

interface SourceFile {
	path?: string; // Path may be undefined if file is in-memory
	contents: string;
}

// Try to read a file from the file-system, returning undefined if not found
function maybeGetDiskFile(filePath: string): Required<SourceFile> | undefined {
	try {
		const contents = fs.readFileSync(filePath, "utf8");
		return { path: filePath, contents };
	} catch (e: any) {
		// Ignore not-found errors, but throw everything else
		if (e.code !== "ENOENT") throw e;
	}
}

function resolvePath(rootPath: string | undefined, filePath: string) {
	if (rootPath !== undefined && !path.isAbsolute(filePath)) {
		return path.resolve(rootPath, filePath);
	}
	return path.resolve(filePath);
}

// Try to extract the path and contents of a `file` reported in a JavaScript
// stack-trace. See the big comment above for the forms these take.
function maybeGetFile(
	allWorkerOpts: ParsedWorkerOptions[],
	fileSpecifier: string
): SourceFile | undefined {
	// If `file` looks like a `file://` URL, use that
	const maybeUrl = maybeParseURL(fileSpecifier);
	if (maybeUrl !== undefined && maybeUrl.protocol === "file:") {
		const filePath = fileURLToPath(maybeUrl);

		// Check if this `filePath` matches inline worker source...
		for (const { config, legacy, dev } of allWorkerOpts) {
			if (
				legacy?.serviceWorkerScriptPath !== undefined &&
				legacy?.serviceWorkerScript !== undefined &&
				resolvePath(dev?.rootPath, legacy.serviceWorkerScriptPath) === filePath
			) {
				return {
					path: filePath,
					contents: legacy.serviceWorkerScript,
				};
			}

			const manifest = config.manifest;
			if (manifest === undefined) continue;
			const modules = manifest.modules;
			for (const [modulePath, module] of Object.entries(modules)) {
				const resolvedModulePath = path.resolve(
					manifest.modulesRoot,
					modulePath
				);
				if (resolvedModulePath === filePath) {
					return {
						path: filePath,
						contents: contentsToString(module.contents),
					};
				}
			}
		}

		// ...otherwise, read contents from disk
		return maybeGetDiskFile(filePath);
	}

	// If `file` looks like "<script:n>", and the `n`th worker is a service
	// worker, use its inline script.
	const workerIndex = maybeGetStringScriptPathIndex(fileSpecifier);
	if (workerIndex !== undefined) {
		const serviceWorkerScript =
			allWorkerOpts[workerIndex]?.legacy?.serviceWorkerScript;
		if (serviceWorkerScript !== undefined) {
			return { contents: serviceWorkerScript };
		}
	}

	// Otherwise, something's gone wrong, so don't do any source mapping.
}

// Like Object.fromEntries(), but preserves all values per header (string or array)
function getHeaders(request: Request) {
	const headers: Record<string, string | string[]> = {};

	for (const [key, value] of request.headers.entries()) {
		if (headers[key] === undefined) {
			headers[key] = value;
		} else if (typeof headers[key] === "string") {
			headers[key] = [headers[key], value];
		} else {
			headers[key].push(value);
		}
	}

	return headers;
}

function getSourceMappedStack(
	workerSrcOpts: ParsedWorkerOptions[],
	error: Error,
	onSourceMap?: (
		sourcemap: RawSourceMap,
		sourceMapPath: string
	) => RawSourceMap | void
) {
	// This function needs to match the signature of the `retrieveSourceMap`
	// option from the "source-map-support" package.
	function retrieveSourceMap(fileSpecifier: string): UrlAndMap | null {
		const sourceFile = maybeGetFile(workerSrcOpts, fileSpecifier);
		if (sourceFile?.path === undefined) return null;

		// Find the last source mapping URL if any
		const sourceMapRegexp = /# sourceMappingURL=(.+)/g;
		const matches = [...sourceFile.contents.matchAll(sourceMapRegexp)];
		// If we couldn't find a source mapping URL, there's nothing we can do
		if (matches.length === 0) return null;
		const sourceMapMatch = matches[matches.length - 1];

		// Get the source map. `maybeGetFile` first checks inline sources (e.g.
		// `sourcemap`-type manifest modules) and falls back to reading from disk.
		const root = path.dirname(sourceFile.path);
		const sourceMapPath = path.resolve(root, sourceMapMatch[1]);
		const sourceMapFile = maybeGetFile(
			workerSrcOpts,
			pathToFileURL(sourceMapPath).href
		);
		if (sourceMapFile?.path === undefined) return null;

		if (onSourceMap) {
			try {
				const sourcemap = JSON.parse(sourceMapFile.contents);
				const result = onSourceMap(sourcemap, sourceMapFile.path);

				if (result !== undefined) {
					return {
						map: JSON.stringify(result),
						url: sourceMapFile.path,
					};
				}
			} catch {
				return null;
			}
		}

		return { map: sourceMapFile.contents, url: sourceMapFile.path };
	}

	// Both our retriever above and the library's own fallback handlers convert
	// frame specifiers with `fileURLToPath`, which throws on file URLs with no
	// local-path form (a non-local host; on Windows, any drive-less path, e.g.
	// from a POSIX-built bundle). A stack trace must never break error
	// reporting: degrade to the unmapped stack instead.
	try {
		return getSourceMapper()(retrieveSourceMap, error);
	} catch {
		return error.stack ?? "";
	}
}

// Due to a bug in `workerd`, if `Promise`s returned from native C++ APIs are
// rejected, their errors will not have `stack`s. This means we can't recover
// the `stack` from dispatching to the user worker binding in our entry worker.
// As a stop-gap solution, user workers should send an HTTP 500 JSON response
// matching the schema below with the `MF-Experimental-Error-Stack` header set
// to a truthy value, in order to display the pretty-error page.

export interface JsonError {
	message?: string;
	name?: string;
	stack?: string;
	cause?: JsonError;
}
export const JsonErrorSchema: z.ZodType<JsonError> = z.lazy(() =>
	z.object({
		message: z.string().optional(),
		name: z.string().optional(),
		stack: z.string().optional(),
		cause: JsonErrorSchema.optional(),
	})
);

interface StandardErrorConstructor {
	new (message?: string, options?: { cause?: Error }): Error;
}
const ALLOWED_ERROR_SUBCLASS_CONSTRUCTORS: StandardErrorConstructor[] = [
	EvalError,
	RangeError,
	ReferenceError,
	SyntaxError,
	TypeError,
	URIError,
];
export function reviveError(
	workerSrcOpts: ParsedWorkerOptions[],
	jsonError: JsonError,
	onSourceMap?: (
		sourcemap: RawSourceMap,
		sourceMapPath: string
	) => RawSourceMap | void
): Error {
	// At a high level, this function takes a JSON-serialisable representation of
	// an `Error`, and converts it to an `Error`. `Error`s may have `cause`s, so
	// we need to do this recursively.
	let cause: Error | undefined;
	if (jsonError.cause !== undefined) {
		cause = reviveError(workerSrcOpts, jsonError.cause, onSourceMap);
	}

	// If this is one of the built-in error types, construct an instance of that.
	// For example, if we threw a `TypeError` in the Worker, we'd like to
	// construct a `TypeError` here, so it looks like the error has been thrown
	// through a regular function call, not an HTTP request (i.e. we want
	// `instanceof TypeError` to pass in Node for `TypeError`s thrown in Workers).
	let ctor: StandardErrorConstructor = Error;
	if (jsonError.name !== undefined && jsonError.name in globalThis) {
		const maybeCtor = (globalThis as Record<string, unknown>)[
			jsonError.name
		] as StandardErrorConstructor;
		if (ALLOWED_ERROR_SUBCLASS_CONSTRUCTORS.includes(maybeCtor)) {
			ctor = maybeCtor;
		}
	}

	// Construct the error, copying over the correct name and stack trace.
	// Because constructing an `Error` captures the stack trace at point of
	// construction, we override the stack trace to the one from the Worker in the
	// JSON-serialised error.
	const error = new ctor(jsonError.message, { cause });
	if (jsonError.name !== undefined) error.name = jsonError.name;
	error.stack = jsonError.stack;

	// Try to apply source-mapping to the stack trace
	error.stack = processStackTrace(
		getSourceMappedStack(workerSrcOpts, error, onSourceMap),
		(line, location) =>
			!location.includes(".wrangler/tmp") &&
			!location.includes("wrangler/templates/middleware")
				? line
				: null
	);

	return error;
}

export async function handlePrettyErrorRequest(
	log: Log,
	workerSrcOpts: ParsedWorkerOptions[],
	request: Request,
	handleUncaughtError?: (error: Error) => void
): Promise<Response> {
	// Parse and validate the error we've been given from user code
	const caught = JsonErrorSchema.parse(await request.json());

	// We might populate the source in Youch with the sources content from the sourcemap
	// in case the source file does not exist on disk
	const sourcesContentMap = new Map<string, string>();
	const error = reviveError(
		workerSrcOpts,
		caught,
		(sourceMap, sourceMapPath) => {
			for (let i = 0; i < sourceMap.sources.length; i++) {
				const source = sourceMap.sources[i];
				const sourceContent = sourceMap.sourcesContent?.[i];

				if (sourceContent) {
					const fullSourcePath = path.resolve(
						path.dirname(sourceMapPath),
						sourceMap.sourceRoot ?? "",
						source
					);
					sourcesContentMap.set(fullSourcePath, sourceContent);
				}
			}
		}
	);

	// Log source-mapped error to console if logging enabled
	log.error(error);

	// Hand the revived, source-mapped error to the embedder — the one place
	// an uncaught Worker exception exists as a structured value in Node
	// (workerd catches handler exceptions to build the 500 response, so they
	// never reach the inspector's `Runtime.exceptionThrown`).
	//
	// The callback only observes the error, so a misbehaving callback must
	// not break the error response we are building here. It can fail in two
	// ways: throw synchronously, or — since an async function is assignable
	// to the `void`-returning signature — return a promise that later
	// rejects. The async wrapper funnels both into a single rejection, which
	// we log instead of propagating.
	void (async () => handleUncaughtError?.(error))().catch(
		(callbackError: unknown) =>
			log.error(
				callbackError instanceof Error
					? callbackError
					: new Error(String(callbackError))
			)
	);

	// Only return a pretty-error HTML page if the client accepts it. Specifically
	// don't return a HTML page to cURL, as HTML with minified scripts is hard to
	// read in the terminal.
	const accept = request.headers.get("Accept")?.toLowerCase() ?? "";
	const userAgent = request.headers.get("User-Agent")?.toLowerCase() ?? "";
	const acceptsPrettyError =
		!userAgent.includes("curl/") &&
		(accept.includes("text/html") ||
			accept.includes("*/*") ||
			accept.includes("text/*"));
	if (!acceptsPrettyError) {
		return new Response(error.stack, { status: 500 });
	}

	// Lazily import `youch` when required
	// eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy require to avoid loading youch until an error page is needed
	const { Youch }: typeof import("youch") = require("youch");
	const youch = new Youch();

	youch.defineSourceLoader(async (stackFrame) => {
		if (!stackFrame.fileName) {
			return;
		}

		for (const { legacy, dev } of workerSrcOpts) {
			if (
				legacy?.serviceWorkerScriptPath !== undefined &&
				legacy?.serviceWorkerScript !== undefined &&
				resolvePath(dev?.rootPath, legacy.serviceWorkerScriptPath) ===
					path.resolve(stackFrame.fileName)
			) {
				return { contents: legacy.serviceWorkerScript };
			}
		}

		if (
			stackFrame.type === "native" ||
			stackFrame.fileName.startsWith("cloudflare:") ||
			stackFrame.fileName.startsWith("node:")
		) {
			stackFrame.type = "native";
			return;
		}

		if (!fs.existsSync(stackFrame.fileName)) {
			// Mark the file type as undefined to skip the link to the source file
			stackFrame.fileType = undefined;
		}

		// Check if it is an inline script, which are reported as "script-<workerIndex>"
		const workerIndex = maybeGetStringScriptPathIndex(stackFrame.fileName);
		if (workerIndex !== undefined) {
			const serviceWorkerScript =
				workerSrcOpts[workerIndex]?.legacy?.serviceWorkerScript;
			if (serviceWorkerScript !== undefined) {
				return { contents: serviceWorkerScript };
			}
		}

		// Check if the source map has the source content for this file so we don't need to read it from disk
		const sourcesContent = sourcesContentMap.get(stackFrame.fileName);
		if (sourcesContent) {
			return { contents: sourcesContent };
		}

		try {
			const contents = fs.readFileSync(stackFrame.fileName, {
				encoding: "utf8",
			});

			return { contents };
		} catch {
			// If we can't read the file, just return undefined
			return;
		}
	});
	youch.useTransformer((error) => {
		error.hint = [
			'<a href="https://developers.cloudflare.com/workers/" target="_blank" style="text-decoration:none;font-style:normal;padding:5px">📚 Workers Docs</a>',
			'<a href="https://discord.cloudflare.com" target="_blank" style="text-decoration:none;font-style: normal;padding:5px">💬 Workers Discord</a>',
		].join("");
	});

	// `youch`'s frame parsing converts `file://` frame specifiers with
	// `fileURLToPath`, which throws on URLs with no local-path form (a
	// non-local host; on Windows, any drive-less path). The pretty page is
	// best-effort: fall back to the plain stack response rather than failing
	// the request.
	let html: string;
	try {
		html = await youch.toHTML(error, {
			request: {
				url: `${request.cf?.prettyErrorOriginalUrl ?? request.url}`,
				method: request.method,
				headers: getHeaders(request),
			},
		});
	} catch {
		return new Response(error.stack, { status: 500 });
	}

	return new Response(html, {
		status: 500,
		headers: { "Content-Type": "text/html;charset=utf-8" },
	});
}

export { getFreshSourceMapSupport } from "./sourcemap";
