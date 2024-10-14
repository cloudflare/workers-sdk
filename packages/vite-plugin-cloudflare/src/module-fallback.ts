import * as vite from 'vite';
import { Request, Response } from 'miniflare';
import { readFile, stat } from 'node:fs/promises';
import { init as initCjsModuleLexer, parse } from 'cjs-module-lexer';
import { dirname, resolve } from 'node:path';

type ResolveIdFunction = (
	id: string,
	importer?: string,
	options?: {
		resolveMethod: 'require' | 'import';
	},
) => Promise<string | undefined>;

export function getResolveId(
	viteConfig: vite.ResolvedConfig,
	devEnvironment: vite.DevEnvironment,
): ResolveIdFunction {
	const esmResolveId = vite.createIdResolver(viteConfig, {});

	// for `require` calls we want a resolver that prioritized node/cjs modules
	const cjsResolveId = vite.createIdResolver(viteConfig, {
		conditions: ['node'],
		mainFields: ['main'],
		webCompatible: false,
		isRequire: true,
		extensions: ['.cjs', '.cts', '.js', '.ts', '.jsx', '.tsx', '.json'],
	});

	return function resolveId(id, importer, options) {
		const resolveMethod = options?.resolveMethod ?? 'import';
		const resolveIdFn =
			resolveMethod === 'import' ? esmResolveId : cjsResolveId;

		return resolveIdFn(devEnvironment, id, importer);
	};
}

export function getModuleFallbackHandler(
	resolveId: ResolveIdFunction,
): ModuleFallbackHandler {
	return patchModuleFallbackHandler(moduleFallbackHandler);

	async function moduleFallbackHandler(request: Request): Promise<Response> {
		const { resolveMethod, referrer, specifier, rawSpecifier } =
			extractModuleFallbackValues(request);

		let resolvedId = await resolveId(
			rawSpecifier,
			await withJsFileExtension(referrer),
			{
				resolveMethod,
			},
		);

		if (!resolvedId) {
			return new Response(null, { status: 404 });
		}

		if (resolvedId.includes('?'))
			resolvedId = resolvedId.slice(0, resolvedId.lastIndexOf('?'));

		const redirectTo =
			!rawSpecifier.startsWith('./') &&
			!rawSpecifier.startsWith('../') &&
			resolvedId !== rawSpecifier &&
			resolvedId !== specifier
				? resolvedId
				: undefined;

		if (redirectTo) {
			return new Response(null, {
				headers: { location: redirectTo },
				status: 301,
			});
		}

		let code: string;

		try {
			code = await readFile(resolvedId, 'utf8');
		} catch {
			return new Response(`Failed to read file ${resolvedId}`, {
				status: 404,
			});
		}

		const moduleInfo = await collectModuleInfo(code, resolvedId);

		let mod = {};

		switch (moduleInfo.moduleType) {
			case 'cjs':
				mod = {
					commonJsModule: code,
					namedExports: moduleInfo.namedExports,
				};
				break;
			case 'esm':
				mod = {
					esModule: code,
				};
				break;
			case 'json':
				mod = {
					json: code,
				};
				break;
		}

		return new Response(
			JSON.stringify({
				name: specifier,
				...mod,
			}),
		);
	}
}

/**
 * Extracts the various module fallback values from the provided request
 *
 * As part of this extraction, the paths are adjusted for windows systems (in which absolute paths should not have leading `/`s)
 *
 * @param request the request the module fallback service received
 * @returns all the extracted (adjusted) values that the fallback service request holds
 */
function extractModuleFallbackValues(request: Request): {
	resolveMethod: 'import' | 'require';
	referrer: string;
	specifier: string;
	rawSpecifier: string;
} {
	const resolveMethod = request.headers.get('X-Resolve-Method');
	if (resolveMethod !== 'import' && resolveMethod !== 'require') {
		throw new Error('unrecognized resolvedMethod');
	}

	const url = new URL(request.url);

	const extractPath = (
		key: 'resolveMethod' | 'referrer' | 'specifier' | 'rawSpecifier',
	): string => {
		const value = url.searchParams.get(key);
		if (!value) {
			throw new Error(`no ${key} provided`);
		}
		return value;
	};

	return {
		resolveMethod,
		referrer: extractPath('referrer'),
		specifier: extractPath('specifier'),
		rawSpecifier: extractPath('rawSpecifier'),
	};
}

/**
 * In the module fallback service we can easily end up with referrers without a javascript (any) file extension.
 *
 * This happens every time a module, resolved without a file extension imports something (in this latter import
 * the specifier is the original module path without the file extension).
 *
 * So when we have a specifier we actually need to add back the file extension if it is missing (because that's needed
 * for relative module resolution to properly work).
 *
 * This function does just that, tries the various possible javascript file extensions and if with one it finds the file
 * on the filesystem then it returns such path (PS: note that even if there were two files with the same exact location and
 * name but different extensions we could be picking up the wrong one here, but that's not a concern since the concern here
 * if just to obtain a real/existent filesystem path here).
 *
 * @param path a path to a javascript file, potentially without a file extension
 * @returns the input path with a js file extension, unless no such file was actually found on the filesystem, in that
 *          case the function returns the exact same path it received (something must have gone wrong somewhere and there
 *          is not much we can do about it here)
 */
async function withJsFileExtension(path: string): Promise<string> {
	const jsFileExtensions = ['.js', '.jsx', '.cjs', '.mjs'];

	const pathHasJsExtension = jsFileExtensions.some((extension) =>
		path.endsWith(extension),
	);

	if (pathHasJsExtension) {
		return path;
	}

	for (const extension of jsFileExtensions) {
		try {
			const pathWithExtension = `${path}${extension}`;
			const fileStat = await stat(pathWithExtension);
			if (fileStat.isFile()) {
				return pathWithExtension;
			}
		} catch {}
	}

	return path;
}

type ModuleFallbackHandler = (request: Request) => Promise<Response>;

/**
 * This function patches the values in and out of the workerd's module fallback service
 *
 * Fixing rough edges of how the module fallback works.
 * Ideally all of the fixes in this functions could be fixed in workerd itself making this function
 * unnecessary.
 *
 * @param handler the module fallback handler as it should be written (without ad-hoc path fixes)
 * @returns the handler wrapped in a way to make it work as intended
 */
function patchModuleFallbackHandler(
	handler: ModuleFallbackHandler,
): ModuleFallbackHandler {
	return async (request) => {
		const url = new URL(request.url);

		for (const pathName of ['referrer', 'specifier']) {
			const path = url.searchParams.get(pathName);
			if (path) {
				// workerd always adds a `/` to the absolute paths (raw values excluded) that is fine in OSes like mac and linux
				// where absolute paths do start with `/` as well. But it is not ok in windows where absolute paths don't start
				// with `/`, so for windows we need to remove the extra leading `/`
				//
				// Either way this is an issue caused by workerd adding the leading `/`, if it were not to do that and simply return
				// the correct path the path would not need fixing
				//
				const fixedPath =
					process.platform !== 'win32' ? path : path.replace(/^\//, '');
				url.searchParams.set(pathName, fixedPath);
			}
		}

		const fixedRequest = new Request(url, {
			headers: request.headers,
		});

		const response = await handler(fixedRequest);

		if (response.status === 301) {
			const location = response.headers.get('location');
			if (!location) {
				return response;
			}

			// on windows we have to add a leading `/` to the returned location, otherwise on next request the module fallback
			// receives will contain an incorrect the specifier (created by concatenating the directory of the referrer with the
			// specifier) causing the module resolution to ultimately fail
			//
			// Why the incorrect specifier if the `/` is missing?
			// My understanding (based on my very limited workerd knowledge) is that, as per this comment:
			// https://github.com/cloudflare/workerd/blob/93953a/src/workerd/server/server.c%2B%2B#L2917-L2918
			// the location returned to the module fallback service becomes the specifier that workerd tries to resolve next.
			// Workerd, tries to resolve the module either as absolute or relative to the referrer:
			// https://github.com/cloudflare/workerd/blob/93953aed/src/workerd/jsg/modules.c%2B%2B#L291
			// based on whether the specifier path start with a `/` or not
			// (https://github.com/capnproto/capnproto/blob/8b93996/c%2B%2B/src/kj/filesystem.h#L120-L131)
			// this works as intended in operative systems where absolute paths do start with `/` but that's not the case
			// in windows, so there we need to add the leading `/` to let workerd know that this is an absolute path.
			// Note that on windows we remove leading `/`s to the specifier and referrer (see above), adding the leading `/`
			// here doesn't cause any issue for our handler.
			const fixedLocation = `${process.platform === 'win32' ? '/' : ''}${location}`;
			return new Response(null, {
				headers: { location: fixedLocation },
				status: 301,
			});
		}

		if (response.status === 200) {
			const respJson = (await response.json()) as { name: string } & Record<
				string,
				string
			>;
			return Response.json({
				...respJson,
				// The name of the module has to never include a leading `/` even if that's exactly the name of the specifier
				// we got, so we need to remove potential leading `/`s
				//
				// Example:
				//    As `specifier` we get:           '/Users/dario/Desktop/vite-environment-providers/node_modules/.pnpm/react@18.3.1/node_modules/react/cjs/react.development.js'
				//    but the result name needs to be: 'Users/dario/Desktop/vite-environment-providers/node_modules/.pnpm/react@18.3.1/node_modules/react/cjs/react.development.js'
				//
				// (source: https://github.com/cloudflare/workerd/blob/442762b03/src/workerd/server/server.c%2B%2B#L2838-L2840)
				name: respJson.name.replace(/^\//, ''),
			});
		}

		return response;
	};
}

async function collectModuleInfo(
	moduleCode: string,
	moduleFilePath: string,
): Promise<CjsModuleInfo | EsmModuleInfo | JsonModuleInfo> {
	if (moduleFilePath.endsWith('.json')) {
		return { moduleType: 'json' };
	}

	if (
		moduleFilePath.endsWith('.mjs') ||
		!(moduleFilePath.endsWith('.cjs') || isCommonJS(moduleCode))
	) {
		return { moduleType: 'esm' };
	}

	await initCjsModuleLexer();

	const namedExportsSet = new Set<string>();

	const cjsLexerResult = parse(moduleCode);
	for (const namedExport of cjsLexerResult.exports) {
		namedExportsSet.add(namedExport);
	}
	for (const reExport of cjsLexerResult.reexports) {
		const reExportsPath = resolve(dirname(moduleFilePath), reExport);

		const reExportsPathHasExtension = ['.cjs', '.js'].some((ext) =>
			reExportsPath.endsWith(ext),
		);

		const extensionsToTry = reExportsPathHasExtension ? [''] : ['.cjs', '.js'];

		let moduleWasResolved = false;

		for (const extension of extensionsToTry) {
			const path = `${reExportsPath}${extension}`;
			let isFile = false;
			try {
				const reExportsFileStat = await stat(path);
				isFile = reExportsFileStat.isFile();
			} catch {}

			if (isFile) {
				moduleWasResolved = true;

				const reExportsCode = await readFile(path, 'utf8');
				const reExportsInfo = await collectModuleInfo(reExportsCode, path);

				if (reExportsInfo.moduleType === 'cjs') {
					for (const namedExport of reExportsInfo.namedExports) {
						namedExportsSet.add(namedExport);
					}
				}
			}
		}

		if (!moduleWasResolved) {
			throw new Error(
				"Error: Found cjs re-export that doesn't point to a relative path",
			);
		}
	}

	const namedExports = [...namedExportsSet].filter(
		(namedExport) => namedExport !== 'default',
	);

	return {
		moduleType: 'cjs',
		namedExports,
	};
}

type CjsModuleInfo = {
	moduleType: 'cjs';
	namedExports: string[];
};

type EsmModuleInfo = {
	moduleType: 'esm';
};

type JsonModuleInfo = {
	moduleType: 'json';
};

function isCommonJS(code: string): boolean {
	const hasRequireCalls = /\brequire\s*\(\s*['"`][^'"`]+['"`]\s*\)/.test(code);
	if (hasRequireCalls) {
		return true;
	}

	// the code has exports such as `exports.aaa = ...`
	const hasDotCjsExports =
		/\bmodule\.exports|exports\.[a-zA-Z_$][0-9a-zA-Z_$]*\s*=/.test(code);
	if (hasDotCjsExports) {
		return true;
	}

	// the code has exports such as `exports["aaa"] = ...`
	const hasBracketsCjsExports =
		/\bmodule\.exports|exports\[(['"])[a-zA-Z_$][0-9a-zA-Z_$]*\1\]\s*=/.test(
			code,
		);
	if (hasBracketsCjsExports) {
		return true;
	}

	// the code has exports such as `Object.defineProperty(exports, "aaa", ...)`
	const hasDefinePropertyOnExports =
		/Object\.defineProperty\(\s*exports,\s*(['"]).*?\1\s*,.*?\)/.test(code);
	if (hasDefinePropertyOnExports) {
		return true;
	}

	return false;
}
