import fs from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { toUrlPath } from "../paths";
import type { UrlPath } from "../paths";
import type { HTTPMethod, RouteConfig } from "./routes";

/**
 * Scan a functions directory and generate a routing configuration
 * based on the file tree.
 *
 * Each `.mjs`, `.js`, `.ts`, `.tsx`, or `.jsx` file is inspected for
 * `onRequest` / `onRequestGet` / `onRequestPost` / ... exports.
 * File and directory names determine route paths; `[param]` becomes
 * `:param` and `[[param]]` becomes `:param*`.
 *
 * @param options - The base directory and base URL for route discovery
 * @returns An object containing the discovered `routes` array
 */
export async function generateConfigFromFileTree({
	baseDir,
	baseURL,
}: {
	baseDir: string;
	baseURL: UrlPath;
}) {
	let routeEntries: RouteConfig[] = [];

	if (!baseURL.startsWith("/")) {
		baseURL = `/${baseURL}` as UrlPath;
	}

	if (baseURL.endsWith("/")) {
		baseURL = baseURL.slice(0, -1) as UrlPath;
	}

	await forEachFile(baseDir, async (filepath) => {
		const ext = path.extname(filepath);
		if (/^\.(mjs|js|ts|tsx|jsx)$/.test(ext)) {
			const buildResult = await build({
				metafile: true,
				write: false,
				bundle: false,
				entryPoints: [path.resolve(filepath)],
			}).catch((e) => {
				throw new PagesFunctionsBuildError(e.message);
			});
			const exportNames: string[] = [];
			if (buildResult.metafile) {
				for (const output of Object.values(buildResult.metafile.outputs)) {
					exportNames.push(...output.exports);
				}
			}
			for (const exportName of exportNames) {
				const [match, method = ""] = (exportName.match(
					/^onRequest(Get|Post|Put|Patch|Delete|Options|Head)?$/
				) ?? []) as (string | undefined)[];

				if (match) {
					const basename = path.basename(filepath).slice(0, -ext.length);

					const isIndexFile = basename === "index";
					const isMiddlewareFile =
						basename === "_middleware" || basename === "_middleware_";

					let routePath = path
						.relative(baseDir, filepath)
						.slice(0, -ext.length);
					let mountPath = path.dirname(routePath);

					if (isIndexFile || isMiddlewareFile) {
						routePath = path.dirname(routePath);
					}

					if (routePath === ".") {
						routePath = "";
					}
					if (mountPath === ".") {
						mountPath = "";
					}

					routePath = `${baseURL}/${routePath}`;
					mountPath = `${baseURL}/${mountPath}`;

					routePath = convertCatchallParams(routePath);
					routePath = convertSimpleParams(routePath);
					mountPath = convertCatchallParams(mountPath);
					mountPath = convertSimpleParams(mountPath);

					// These are used as module specifiers so UrlPaths are okay to use even on Windows
					const modulePath = toUrlPath(path.relative(baseDir, filepath));

					const routeEntry: RouteConfig = {
						routePath: toUrlPath(routePath),
						mountPath: toUrlPath(mountPath),
						method: method.toUpperCase() as HTTPMethod,
						[isMiddlewareFile ? "middleware" : "module"]: [
							`${modulePath}:${exportName}`,
						],
					};

					routeEntries.push(routeEntry);
				}
			}
		}
	});
	// Combine together any routes (index routes) which contain both a module and a middleware
	routeEntries = routeEntries.reduce(
		(acc: typeof routeEntries, { routePath, ...rest }) => {
			const existingRouteEntry = acc.find(
				(routeEntry) =>
					routeEntry.routePath === routePath &&
					routeEntry.method === rest.method
			);
			if (existingRouteEntry !== undefined) {
				Object.assign(existingRouteEntry, rest);
			} else {
				acc.push({ routePath, ...rest });
			}
			return acc;
		},
		[]
	);

	routeEntries.sort((a, b) => compareRoutes(a, b));

	return {
		routes: routeEntries,
	};
}

/**
 * Ensure routes are produced in order of precedence so that
 * more specific routes aren't occluded from matching due to
 * less specific routes appearing first in the route list.
 *
 * @param a - First route to compare
 * @param b - Second route to compare
 * @returns A negative number if `a` is more specific, positive if `b` is, or 0 if equal
 */
export function compareRoutes(
	{ routePath: routePathA, method: methodA }: RouteConfig,
	{ routePath: routePathB, method: methodB }: RouteConfig
) {
	function parseRoutePath(routePath: UrlPath): string[] {
		return routePath.slice(1).split("/").filter(Boolean);
	}

	const segmentsA = parseRoutePath(routePathA);
	const segmentsB = parseRoutePath(routePathB);

	// sort routes with fewer segments after those with more segments
	if (segmentsA.length !== segmentsB.length) {
		return segmentsB.length - segmentsA.length;
	}

	for (let i = 0; i < segmentsA.length; i++) {
		const segA = segmentsA[i] ?? "";
		const segB = segmentsB[i] ?? "";
		const isWildcardA = segA.includes("*");
		const isWildcardB = segB.includes("*");
		const isParamA = segA.includes(":");
		const isParamB = segB.includes(":");

		// sort wildcard segments after non-wildcard segments
		if (isWildcardA && !isWildcardB) {
			return 1;
		}
		if (!isWildcardA && isWildcardB) {
			return -1;
		}

		// sort dynamic param segments after non-param segments
		if (isParamA && !isParamB) {
			return 1;
		}
		if (!isParamA && isParamB) {
			return -1;
		}
	}

	// sort routes that specify an HTTP before those that don't
	if (methodA && !methodB) {
		return -1;
	}
	if (!methodA && methodB) {
		return 1;
	}

	// all else equal, just sort the paths lexicographically
	return routePathA.localeCompare(routePathB);
}

async function forEachFile<T>(
	baseDir: string,
	fn: (filepath: string) => T | Promise<T>
) {
	const searchPaths = [baseDir];
	const returnValues: T[] = [];

	while (isNotEmpty(searchPaths)) {
		const cwd = searchPaths.shift();
		const dir = await fs.readdir(cwd, { withFileTypes: true });
		for (const entry of dir) {
			const pathname = path.join(cwd, entry.name);
			if (entry.isDirectory()) {
				searchPaths.push(pathname);
			} else if (entry.isFile()) {
				returnValues.push(await fn(pathname));
			}
		}
	}

	return returnValues;
}

interface NonEmptyArray<T> extends Array<T> {
	shift(): T;
}
function isNotEmpty<T>(array: T[]): array is NonEmptyArray<T> {
	return array.length > 0;
}

/**
 * See https://github.com/pillarjs/path-to-regexp?tab=readme-ov-file#named-parameters
 */
const validParamNameRegExp = /^[A-Za-z0-9_]+$/;

/**
 * Transform all [[id]] => :id*
 *
 * @param routePath - A route path potentially containing catch-all parameters
 * @returns The route path with catch-all parameters converted
 */
function convertCatchallParams(routePath: string): string {
	return routePath.replace(/\[\[([^\]]+)\]\]/g, (_, param) => {
		if (validParamNameRegExp.test(param)) {
			return `:${param}*`;
		} else {
			throw new PagesFunctionsError(
				`Invalid Pages function route parameter - "[[${param}]]". Parameters names must only contain alphanumeric and underscore characters.`,
				PagesFunctionsErrorCode.INVALID_CATCHALL_ROUTE_PARAMETER
			);
		}
	});
}

/**
 * Transform all [id] => :id
 *
 * @param routePath - A route path potentially containing simple parameters
 * @returns The route path with simple parameters converted
 */
function convertSimpleParams(routePath: string): string {
	return routePath.replace(/\[([^\]]+)\]/g, (_, param) => {
		if (validParamNameRegExp.test(param)) {
			return `:${param}`;
		} else {
			throw new PagesFunctionsError(
				`Invalid Pages function route parameter - "[${param}]". Parameter names must only contain alphanumeric and underscore characters.`,
				PagesFunctionsErrorCode.INVALID_ROUTE_PARAMETER
			);
		}
	});
}

/**
 * Error codes for classifiable failures from the Pages Functions package.
 *
 * Consumers (e.g. Wrangler) can inspect `PagesFunctionsError.code` to map
 * each failure to the appropriate error class and telemetry label.
 */
export const PagesFunctionsErrorCode = {
	/** An esbuild build of a function file failed while inspecting exports. */
	ROUTE_BUILD_FAILED: "ROUTE_BUILD_FAILED",
	/** A catch-all route parameter `[[param]]` has an invalid name. */
	INVALID_CATCHALL_ROUTE_PARAMETER: "INVALID_CATCHALL_ROUTE_PARAMETER",
	/** A simple route parameter `[param]` has an invalid name. */
	INVALID_ROUTE_PARAMETER: "INVALID_ROUTE_PARAMETER",
	/** A module path resolved outside the project root (path-traversal guard). */
	INVALID_MODULE_PATH: "INVALID_MODULE_PATH",
	/** A module identifier is not a valid JavaScript identifier (injection guard). */
	INVALID_MODULE_IDENTIFIER: "INVALID_MODULE_IDENTIFIER",
} as const;

/**
 * Union of all classifiable error codes from the Pages Functions package.
 */
export type PagesFunctionsErrorCode =
	(typeof PagesFunctionsErrorCode)[keyof typeof PagesFunctionsErrorCode];

/**
 * Typed error thrown by the Pages Functions package.
 *
 * Carries a `code` from {@link PagesFunctionsErrorCode} so callers can
 * distinguish different failure modes without parsing the message string.
 */
export class PagesFunctionsError extends Error {
	/** The classifiable error code for this failure. */
	readonly code: PagesFunctionsErrorCode;

	/**
	 * @param message - Human-readable error description
	 * @param code - The classifiable error code
	 */
	constructor(message: string, code: PagesFunctionsErrorCode) {
		super(message);
		this.name = "PagesFunctionsError";
		this.code = code;
	}
}

/**
 * Error thrown when building a Pages function file to inspect its exports fails.
 *
 * A convenience subclass of {@link PagesFunctionsError} that sets the error
 * code to {@link PagesFunctionsErrorCode.ROUTE_BUILD_FAILED} automatically.
 */
export class PagesFunctionsBuildError extends PagesFunctionsError {
	/**
	 * @param message - The esbuild error message
	 */
	constructor(message: string) {
		super(message, PagesFunctionsErrorCode.ROUTE_BUILD_FAILED);
		this.name = "PagesFunctionsBuildError";
	}
}
