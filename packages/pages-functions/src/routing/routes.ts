import fs from "node:fs/promises";
import path from "node:path";
import {
	PagesFunctionsError,
	PagesFunctionsErrorCode,
} from "./filepath-routing";
import { isValidIdentifier, normalizeIdentifier } from "./identifiers";
import type { UrlPath } from "../paths";

export type HTTPMethod =
	| "HEAD"
	| "OPTIONS"
	| "GET"
	| "POST"
	| "PUT"
	| "PATCH"
	| "DELETE";

type RoutesCollection = Array<{
	routePath: UrlPath;
	mountPath: UrlPath;
	method?: HTTPMethod;
	modules: string[];
	middlewares: string[];
}>;

export type Config = {
	routes?: RouteConfig[];
	schedules?: unknown;
};

export type RouteConfig = {
	routePath: UrlPath;
	mountPath: UrlPath;
	method?: HTTPMethod;
	middleware?: string | string[];
	module?: string | string[];
};

type ImportMap = Map<
	string,
	{
		filepath: string;
		name: string;
		identifier: string;
	}
>;

type Arguments = {
	config: Config;
	outfile: string;
	srcDir: string;
};

/**
 * Write a JavaScript module that imports all discovered route handlers
 * and re-exports them as a `routes` array suitable for injection into
 * the Pages Worker runtime template.
 *
 * @param args - Route configuration, source directory, and output path
 * @returns The path the module was written to
 */
export async function writeRoutesModule({
	config,
	srcDir,
	outfile = "_routes.js",
}: Arguments) {
	const { importMap, routes } = parseConfig(config, srcDir);
	const routesModule = generateRoutesModule(importMap, routes);

	await fs.writeFile(outfile, routesModule);

	return outfile;
}

/**
 * Generate the routes module source code as a string without writing
 * it to disk.
 *
 * @param config - Route configuration from filepath discovery
 * @param srcDir - Absolute path to the Functions source directory
 * @returns The generated JavaScript module source code
 */
export function generateRoutesModuleSource(config: Config, srcDir: string) {
	const { importMap, routes } = parseConfig(config, srcDir);
	return generateRoutesModule(importMap, routes);
}

function parseConfig(config: Config, baseDir: string) {
	baseDir = path.resolve(baseDir);
	const routes: RoutesCollection = [];
	const importMap: ImportMap = new Map();
	const identifierCount = new Map<string, number>();

	function parseModuleIdentifiers(paths: string | string[] | undefined) {
		if (typeof paths === "undefined") {
			paths = [];
		}

		if (typeof paths === "string") {
			paths = [paths];
		}

		return paths.map((modulePath) => {
			const resolvedPath = path.resolve(baseDir, modulePath);
			const moduleRoot = path.parse(resolvedPath).root;

			// Strip the drive letter (if any) to avoid confusing the drive colon with the export name separator
			const strippedPath = resolvedPath.slice(moduleRoot.length - 1);
			const [filepath = "", name = "default"] = strippedPath.split(":");

			const fullFilepath = path.resolve(moduleRoot, filepath);
			const relativePath = path.relative(baseDir, fullFilepath);

			// ensure the filepath isn't attempting to resolve to anything outside of the project
			if (
				moduleRoot !== path.parse(baseDir).root ||
				relativePath.startsWith("..")
			) {
				throw new PagesFunctionsError(
					`Invalid module path "${fullFilepath}"`,
					PagesFunctionsErrorCode.INVALID_MODULE_PATH
				);
			}

			// ensure the module name (if provided) is a valid identifier to guard against injection attacks
			if (name !== "default" && !isValidIdentifier(name)) {
				throw new PagesFunctionsError(
					`Invalid module identifier "${name}"`,
					PagesFunctionsErrorCode.INVALID_MODULE_IDENTIFIER
				);
			}

			let { identifier } = importMap.get(resolvedPath) ?? {};
			if (!identifier) {
				identifier = normalizeIdentifier(`__${relativePath}_${name}`);

				let count = identifierCount.get(identifier) ?? 0;
				identifierCount.set(identifier, ++count);

				if (count > 1) {
					identifier += `_${count}`;
				}

				importMap.set(resolvedPath, {
					filepath: fullFilepath,
					name,
					identifier,
				});
			}

			return identifier;
		});
	}

	for (const { routePath, mountPath, method, ...props } of config.routes ??
		[]) {
		routes.push({
			routePath,
			mountPath,
			method,
			middlewares: parseModuleIdentifiers(props.middleware),
			modules: parseModuleIdentifiers(props.module),
		});
	}

	return { routes, importMap };
}

function generateRoutesModule(importMap: ImportMap, routes: RoutesCollection) {
	return `${[...importMap.values()]
		.map(
			({ filepath, name, identifier }) =>
				`import { ${name} as ${identifier} } from ${JSON.stringify(filepath)}`
		)
		.join("\n")}

export const routes = [
  ${routes
		.map(
			(route) => `  {
      routePath: "${route.routePath}",
      mountPath: "${route.mountPath}",
      method: "${route.method}",
      middlewares: [${route.middlewares.join(", ")}],
      modules: [${route.modules.join(", ")}],
    },`
		)
		.join("\n")}
  ]`;
}
