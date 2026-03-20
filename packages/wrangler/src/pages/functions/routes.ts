import fs from "node:fs/promises";
import path from "node:path";
import { UserError } from "@cloudflare/workers-utils";
import { isValidIdentifier, normalizeIdentifier } from "./identifiers";
import type { UrlPath } from "../../paths";

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

function parseConfig(config: Config, baseDir: string) {
	baseDir = path.resolve(baseDir);
	const routes: RoutesCollection = [];
	const importMap: ImportMap = new Map();
	const identifierCount = new Map<string, number>(); // to keep track of identifier collisions

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
			const [filepath, name = "default"] = strippedPath.split(":");

			const fullFilepath = path.resolve(moduleRoot, filepath);
			const relativePath = path.relative(baseDir, fullFilepath);

			// ensure the filepath isn't attempting to resolve to anything outside of the project
			if (
				moduleRoot !== path.parse(baseDir).root ||
				relativePath.startsWith("..")
			) {
				throw new UserError(`Invalid module path "${fullFilepath}"`);
			}

			// ensure the module name (if provided) is a valid identifier to guard against injection attacks
			if (name !== "default" && !isValidIdentifier(name)) {
				throw new UserError(`Invalid module identifier "${name}"`);
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
