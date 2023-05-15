import fs from "fs";
import path from "path";
import type { UrlAndMap } from "source-map-support";
import { z } from "zod";
import { Request, Response } from "../../../http";
import { Log } from "../../../shared";
import { getUserServiceName } from "../constants";
import {
	SourceOptions,
	contentsToString,
	maybeGetStringScriptPathIndex,
} from "../modules";
import { getSourceMapper } from "./sourcemap";

// Subset of core worker options that define Worker source code.
// These are the possible cases, and corresponding reported source files in
// workerd stack traces.
//
// Single Worker:
// (a) { script: "<contents>" }                                          -> "core:user:"
// (b) { script: "<contents>", modules: true }                           -> "<script:0>"
// (c) { script: "<contents>", scriptPath: "<path>" }                    -> "core:user:"
// (d) { script: "<contents>", scriptPath: "<path>", modules: true }     -> "<path>"
// (e) { scriptPath: "<path>" }                                          -> "core:user:"
// (f) { scriptPath: "<path>", modules: true }                           -> "<path>"
// (g) { modules: [
//   [i]  { ..., path: "<path:0>", contents: "<contents:0>" },           -> "<path:0>" relative to cwd
//  [ii]  { ..., path: "<path:1>" },                                     -> "<path:1>" relative to cwd
//     ] }
// (h) { modulesRoot: "<root>", modules: [
//   [i]  { ..., path: "<path:0>", contents: "<contents:0>" },           -> "<path:0>" relative to "<root>"
//  [ii]  { ..., path: "<path:1>" },                                     -> "<path:1>" relative to "<root>"
//     ] }
//
// Multiple Workers (array of `SourceOptions`):
// (i) [
//   [i]  { script: "<contents:0>" },                                    -> "core:user:"
//  [ii]  { name: "a", script: "<contents:1>" },                         -> "core:user:a"
// [iii]  { name: "b", script: "<contents:2>", scriptPath: "<path:2>" }, -> "core:user:b"
//  [iv]  { name: "c", scriptPath: "<path:3>" },                         -> "core:user:c"
//   [v]  { script: "<contents:3>", modules: true },                     -> "<script:3>"
//     ]
//

interface SourceFile {
	path?: string; // Path may be undefined if file is in-memory
	contents: string;
}

// Try to read a file from the file-system, returning undefined if not found
function maybeGetDiskFile(filePath: string): SourceFile | undefined {
	try {
		const contents = fs.readFileSync(filePath, "utf8");
		return { path: filePath, contents };
	} catch (e: any) {
		// Ignore not-found errors, but throw everything else
		if (e.code !== "ENOENT") throw e;
	}
}

export type NameSourceOptions = SourceOptions & { name?: string };

// Try to extract the path and contents of a `file` reported in a JavaScript
// stack-trace. See the `SourceOptions` comment for examples of what these look
// like.
function maybeGetFile(
	workerSrcOpts: NameSourceOptions[],
	file: string
): SourceFile | undefined {
	// Resolve file relative to current working directory
	const filePath = path.resolve(file);

	// Cases: (g), (h)
	// 1. If path matches any `modules` with ((g)[i], (h)[i]) or without
	//    ((g)[ii], (h)[ii]) custom `contents`, use those.
	for (const srcOpts of workerSrcOpts) {
		if (Array.isArray(srcOpts.modules)) {
			const modulesRoot =
				"modulesRoot" in srcOpts ? srcOpts.modulesRoot : undefined;
			// Handle cases (h)[i] and (h)[ii], by re-resolving file relative to
			// module root if any
			const modulesRootedFilePath =
				modulesRoot === undefined ? filePath : path.resolve(modulesRoot, file);
			for (const module of srcOpts.modules) {
				if (path.resolve(module.path) === modulesRootedFilePath) {
					if (module.contents === undefined) {
						// Cases: (g)[ii], (h)[ii]
						return maybeGetDiskFile(modulesRootedFilePath);
					} else {
						// Cases: (g)[i], (h)[i]
						return {
							path: modulesRootedFilePath,
							contents: contentsToString(module.contents),
						};
					}
				}
			}
		}
	}

	// Case: (d)
	// 2. If path matches any `scriptPath`s with custom `script`s, use those
	for (const srcOpts of workerSrcOpts) {
		if (
			"scriptPath" in srcOpts &&
			"script" in srcOpts &&
			srcOpts.scriptPath !== undefined &&
			srcOpts.script !== undefined &&
			path.resolve(srcOpts.scriptPath) === filePath
		) {
			return { path: filePath, contents: srcOpts.script };
		}
	}

	// Cases: (b), (i)[v]
	// 3. If file looks like "<script:n>", and the `n`th worker has a custom
	//    `script`, use that.
	const workerIndex = maybeGetStringScriptPathIndex(file);
	if (workerIndex !== undefined) {
		const srcOpts = workerSrcOpts[workerIndex];
		if ("script" in srcOpts && srcOpts.script !== undefined) {
			return { contents: srcOpts.script };
		}
	}

	// Cases: (a), (c), (e), (i)[i], (i)[ii], (i)[iii], (i)[iv]
	// 4. If `file` is the name of a service, use that services' source.
	for (const srcOpts of workerSrcOpts) {
		if (
			file === getUserServiceName(srcOpts.name) &&
			(srcOpts.modules === undefined || srcOpts.modules === false)
		) {
			if ("script" in srcOpts && srcOpts.script !== undefined) {
				// Cases: (a), (c), (i)[i], (i)[ii], (i)[iii]
				// ...if a custom `script` is defined, use that, with the defined
				// `scriptPath` if any (Case (c))
				return {
					path:
						srcOpts.scriptPath === undefined
							? undefined
							: path.resolve(srcOpts.scriptPath),
					contents: srcOpts.script,
				};
			} else if (srcOpts.scriptPath !== undefined) {
				// Case: (e), (i)[iv]
				// ...otherwise, if a `scriptPath` is defined, use that
				return maybeGetDiskFile(path.resolve(srcOpts.scriptPath));
			}
		}
	}

	// Cases: (f)
	// 5. Finally, fallback to file-system lookup
	return maybeGetDiskFile(filePath);
}

function getSourceMappedStack(
	workerSrcOpts: NameSourceOptions[],
	error: Error
) {
	// This function needs to match the signature of the `retrieveSourceMap`
	// option from the "source-map-support" package.
	function retrieveSourceMap(file: string): UrlAndMap | null {
		const sourceFile = maybeGetFile(workerSrcOpts, file);
		if (sourceFile?.path === undefined) return null;

		// Find the last source mapping URL if any
		const sourceMapRegexp = /# sourceMappingURL=(.+)/g;
		const matches = [...sourceFile.contents.matchAll(sourceMapRegexp)];
		// If we couldn't find a source mapping URL, there's nothing we can do
		if (matches.length === 0) return null;
		const sourceMapMatch = matches[matches.length - 1];

		// Get the source map
		const root = path.dirname(sourceFile.path);
		const sourceMapPath = path.resolve(root, sourceMapMatch[1]);
		const sourceMapFile = maybeGetDiskFile(sourceMapPath);
		if (sourceMapFile === undefined) return null;

		return { map: sourceMapFile.contents };
	}

	return getSourceMapper()(retrieveSourceMap, error);
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
	workerSrcOpts: NameSourceOptions[],
	jsonError: JsonError
): Error {
	// At a high level, this function takes a JSON-serialisable representation of
	// an `Error`, and converts it to an `Error`. `Error`s may have `cause`s, so
	// we need to do this recursively.
	let cause: Error | undefined;
	if (jsonError.cause !== undefined) {
		cause = reviveError(workerSrcOpts, jsonError.cause);
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
	error.stack = getSourceMappedStack(workerSrcOpts, error);

	return error;
}

export async function handlePrettyErrorRequest(
	log: Log,
	workerSrcOpts: NameSourceOptions[],
	request: Request
): Promise<Response> {
	// Parse and validate the error we've been given from user code
	const caught = JsonErrorSchema.parse(await request.json());

	// Convert the error into a regular `Error` object and try to source-map it.
	// We need to give `name`, `message` and `stack` to Youch, but StackTracy,
	// Youch's dependency for parsing `stack`s, will only extract `stack` from
	// an object if it's an `instanceof Error`.
	const error = reviveError(workerSrcOpts, caught);

	// Log source-mapped error to console if logging enabled
	log.error(error);

	// Lazily import `youch` when required
	const Youch: typeof import("youch").default = require("youch");
	// `cause` is usually more useful than the error itself, display that instead
	// TODO(someday): would be nice if we could display both
	const youch = new Youch(error.cause ?? error, {
		url: request.url,
		method: request.method,
		headers: Object.fromEntries(request.headers),
	});
	youch.addLink(() => {
		return [
			'<a href="https://developers.cloudflare.com/workers/" target="_blank" style="text-decoration:none">📚 Workers Docs</a>',
			'<a href="https://discord.gg/cloudflaredev" target="_blank" style="text-decoration:none">💬 Workers Discord</a>',
		].join("");
	});
	return new Response(await youch.toHTML(), {
		status: 500,
		headers: { "Content-Type": "text/html;charset=utf-8" },
	});
}
