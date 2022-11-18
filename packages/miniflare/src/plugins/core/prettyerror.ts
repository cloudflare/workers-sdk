import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SourceMapConsumer } from "source-map";
import type { Entry } from "stacktracey";
import { Request, Response } from "undici";
import { z } from "zod";
import {
	ModuleDefinition,
	contentsToString,
	maybeGetStringScriptPathIndex,
} from "./modules";

// Subset of core worker options that define Worker source code.
// These are the possible cases, and corresponding reported source files in
// workerd stack traces. Note that all service-worker scripts will be called
// "worker.js" in `workerd`, so we can't differentiate between multiple workers.
// TODO: see if we can add a service-worker script path config option to handle
//  case (i)[i]
//
// Single Worker:
// (a) { script: "<contents>" }                                       -> "worker.js"
// (b) { script: "<contents>", modules: true }                        -> "<script:0>"
// (c) { script: "<contents>", scriptPath: "<path>" }                 -> "worker.js"
// (d) { script: "<contents>", scriptPath: "<path>", modules: true }  -> "<path>"
// (e) { scriptPath: "<path>" }                                       -> "worker.js"
// (f) { scriptPath: "<path>", modules: true }                        -> "<path>"
// (g) { modules: [
//   [i]  { ..., path: "<path:0>", contents: "<contents:0>" },        -> "<path:0>" relative to cwd
//  [ii]  { ..., path: "<path:1>" },                                  -> "<path:1>" relative to cwd
//     ] }
// (h) { modulesRoot: "<root>", modules: [
//   [i]  { ..., path: "<path:0>", contents: "<contents:0>" },        -> "<path:0>" relative to "<root>"
//  [ii]  { ..., path: "<path:1>" },                                  -> "<path:1>" relative to "<root>"
//     ] }
//
// Multiple Workers (array of `SourceOptions`):
// (i) [                                                                 (note cannot differentiate "worker.js"s)
//   [i]  { script: "<contents:0>" },                                 -> "worker.js"
//        { script: "<contents:1>" },                                 -> "worker.js"
//        { script: "<contents:2>", scriptPath: "<path:2>" },         -> "worker.js"
//  [ii]  { script: "<contents:3>", modules: true },                  -> "<script:3>"
//     ]
//
export interface SourceOptions {
	script?: string;
	scriptPath?: string;
	modules?: boolean | ModuleDefinition[];
	modulesRoot?: string;
}

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

// Try to extract the path and contents of a `file` reported in a JavaScript
// stack-trace. See the `SourceOptions` comment for examples of what these look
// like.
function maybeGetFile(
	workerSrcOpts: SourceOptions[],
	file: string
): SourceFile | undefined {
	// Resolve file relative to current working directory
	const filePath = path.resolve(file);

	// Cases: (g), (h)
	// 1. If path matches any `modules` with ((g)[i], (h)[i]) or without
	//    ((g)[ii], (h)[ii]) custom `contents`, use those.
	for (const srcOpts of workerSrcOpts) {
		if (Array.isArray(srcOpts.modules)) {
			const modulesRoot = srcOpts.modulesRoot;
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
			srcOpts.scriptPath !== undefined &&
			srcOpts.script !== undefined &&
			path.resolve(srcOpts.scriptPath) === filePath
		) {
			return { path: filePath, contents: srcOpts.script };
		}
	}

	// Cases: (b), (i)[ii]
	// 3. If file looks like "<script:n>", and the `n`th worker has a custom
	//    `script`, use that.
	const workerIndex = maybeGetStringScriptPathIndex(file);
	if (workerIndex !== undefined) {
		const srcOpts = workerSrcOpts[workerIndex];
		if (srcOpts.script !== undefined) {
			return { contents: srcOpts.script };
		}
	}

	// Cases: (a), (c), (e)
	// 4. If there is a single worker defined with `modules` disabled, the
	//    file is "worker.js", then...
	//
	//    Note: can't handle case (i)[i], as cannot distinguish between multiple
	//    "worker.js"s, hence the check for a single worker. We'd rather be
	//    conservative and return no contents (and therefore no source code in the
	//    error page) over incorrect ones.
	if (workerSrcOpts.length === 1) {
		const srcOpts = workerSrcOpts[0];
		if (
			file === "worker.js" &&
			(srcOpts.modules === undefined || srcOpts.modules === false)
		) {
			if (srcOpts.script !== undefined) {
				// Cases: (a), (c)
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
				// Case: (e)
				// ...otherwise, if a `scriptPath` is defined, use that
				return maybeGetDiskFile(path.resolve(srcOpts.scriptPath));
			}
		}
	}

	// Cases: (f)
	// 5. Finally, fallback to file-system lookup
	return maybeGetDiskFile(filePath);
}

// Try to find a source map for `sourceFile`, and update `sourceFile` and
// `frame` with source mapped locations
type SourceMapCache = Map<string, Promise<SourceMapConsumer>>;
async function applySourceMaps(
	/* mut */ sourceMapCache: SourceMapCache,
	/* mut */ sourceFile: SourceFile,
	/* mut */ frame: Entry
) {
	// If we don't have a file path, or full location, we can't do any source
	// mapping, so return straight away.
	// TODO: support data URIs for maps, in `sourceFile`s without path
	if (
		sourceFile.path === undefined ||
		frame.line === undefined ||
		frame.column === undefined
	) {
		return;
	}

	// Find the last source mapping URL if any
	const sourceMapRegexp = /# sourceMappingURL=(.+)/g;
	let sourceMapMatch: RegExpMatchArray | null = null;
	while (true) {
		const match = sourceMapRegexp.exec(sourceFile.contents);
		if (match !== null) sourceMapMatch = match;
		else break;
	}
	// If we couldn't find a source mapping URL, there's nothing we can do
	if (sourceMapMatch === null) return;

	// Get the source map
	const root = path.dirname(sourceFile.path);
	const sourceMapPath = path.resolve(root, sourceMapMatch[1]);
	let consumerPromise = sourceMapCache.get(sourceMapPath);
	if (consumerPromise === undefined) {
		// If we couldn't find the source map in cache, load it
		const sourceMapFile = maybeGetDiskFile(sourceMapPath);
		if (sourceMapFile === undefined) return;
		const rawSourceMap = JSON.parse(sourceMapFile.contents);
		consumerPromise = new SourceMapConsumer(rawSourceMap);
		sourceMapCache.set(sourceMapPath, consumerPromise);
	}
	const consumer = await consumerPromise;

	// Get original position from source map
	const original = consumer.originalPositionFor({
		line: frame.line,
		column: frame.column,
	});
	// If source mapping failed, don't make changes
	if (
		original.source === null ||
		original.line === null ||
		original.column === null
	) {
		return;
	}

	// Update source file and frame with source mapped locations
	const newSourceFile = maybeGetDiskFile(original.source);
	if (newSourceFile === undefined) return;
	sourceFile.path = original.source;
	sourceFile.contents = newSourceFile.contents;
	frame.file = original.source;
	frame.fileRelative = path.relative("", sourceFile.path);
	frame.fileShort = frame.fileRelative;
	frame.fileName = path.basename(sourceFile.path);
	frame.line = original.line;
	frame.column = original.column;
}

interface YouchInternalFrameSource {
	pre: string[];
	line: string;
	post: string[];
}
interface YouchInternals {
	options: { preLines: number; postLines: number };
	_getFrameSource(frame: Entry): Promise<YouchInternalFrameSource | null>;
}

// Due to a bug in `workerd`, if `Promise`s returned from native C++ APIs are
// rejected, their errors will not have `stack`s. This means we can't recover
// the `stack` from dispatching to the user worker binding in our entry worker.
// As a stop-gap solution, user workers should send an HTTP 500 JSON response
// matching the schema below with the `MF-Experimental-Error-Stack` header set
// to a truthy value, in order to display the pretty-error page.
export const HEADER_ERROR_STACK = "MF-Experimental-Error-Stack";
const ErrorSchema = z.object({
	message: z.ostring(),
	name: z.ostring(),
	stack: z.ostring(),
});
export async function handlePrettyErrorRequest(
	workerSrcOpts: SourceOptions[],
	request: Request
): Promise<Response> {
	// Parse and validate the error we've been given from user code
	const caught = ErrorSchema.parse(await request.json());

	// We need to give `name`, `message` and `stack` to Youch, but StackTracy,
	// Youch's dependency for parsing `stack`s, will only extract `stack` from
	// an object if it's an `instanceof Error`.
	const error = new Error();
	error.name = caught.name as string;
	error.message = caught.message as string;
	error.stack = caught.stack;

	// Create a source-map cache for this pretty-error request. We only cache per
	// request, as it's likely the user will update their code and restart/call
	// `setOptions` again on seeing this page. This would invalidate existing
	// source maps. Keeping the cache per request simplifies things too.
	const sourceMapCache: SourceMapCache = new Map();

	// Lazily import `youch` when required
	const Youch: typeof import("youch").default = require("youch");
	const youch = new Youch(error, {
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
	const youchInternals = youch as unknown as YouchInternals;
	youchInternals._getFrameSource = async (frame) => {
		// Adapted from Youch's own implementation
		let file = frame.file
			.replace(/dist\/webpack:\//g, "") // Unix
			.replace(/dist\\webpack:\\/g, ""); // Windows
		// Ignore error as frame source is optional anyway
		try {
			file = file.startsWith("file:") ? fileURLToPath(file) : file;
		} catch {}

		// Try get source-mapped file contents
		const sourceFile = await maybeGetFile(workerSrcOpts, file);
		if (sourceFile === undefined || frame.line === undefined) return null;
		// If source-mapping fails, this function won't do anything
		await applySourceMaps(sourceMapCache, sourceFile, frame);

		// Return lines around frame as required by Youch
		const lines = sourceFile.contents.split(/\r?\n/);
		const line = frame.line;
		const pre = lines.slice(
			Math.max(0, line - (youchInternals.options.preLines + 1)),
			line - 1
		);
		const post = lines.slice(line, line + youchInternals.options.postLines);
		return { pre, line: lines[line - 1], post };
	};

	try {
		return new Response(await youch.toHTML(), {
			headers: { "Content-Type": "text/html;charset=utf-8" },
		});
	} finally {
		// Clean-up source-map cache
		for (const consumer of sourceMapCache.values()) (await consumer).destroy();
	}
}
