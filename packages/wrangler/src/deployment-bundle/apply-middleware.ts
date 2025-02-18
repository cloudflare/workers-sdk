import * as fs from "node:fs";
import * as path from "node:path";
import { getBasePath } from "../paths";
import { dedent } from "../utils/dedent";
import type { Entry } from "./entry";
import type { CfScriptFormat } from "./worker";

/**
 * A facade that acts as a "middleware loader".
 * Instead of needing to apply a facade for each individual middleware, this allows
 * middleware to be written in a more traditional manner and then be applied all
 * at once, requiring just two esbuild steps, rather than 1 per middleware.
 */
export interface MiddlewareLoader {
	name: string;
	path: string;
	// This will be provided as a virtual module at `config:middleware/${name}`,
	// where `name` is the name of this middleware, and the module contains
	// named exports for each property on the `config` record.
	config?: Record<string, unknown>;
	supports: CfScriptFormat[];
}

export async function applyMiddlewareLoaderFacade(
	entry: Entry,
	tmpDirPath: string,
	middleware: MiddlewareLoader[]
): Promise<{ entry: Entry; inject?: string[] }> {
	// Firstly we need to insert the middleware array into the project,
	// and then we load the middleware - this insertion and loading is
	// different for each format.
	// Make sure we resolve all files relative to the actual temporary directory,
	// otherwise we'll have issues with source maps
	tmpDirPath = fs.realpathSync(tmpDirPath);

	// We need to import each of the middlewares, so we need to generate a
	// random, unique identifier that we can use for the import.
	// Middlewares are required to be default exports so we can import to any name.
	const middlewareIdentifiers = middleware.map((m, index) => [
		`__MIDDLEWARE_${index}__`,
		path.resolve(getBasePath(), m.path),
	]);

	const dynamicFacadePath = path.join(
		tmpDirPath,
		"middleware-insertion-facade.js"
	);
	const imports = middlewareIdentifiers
		.map(
			([id, middlewarePath]) =>
				/*javascript*/ `import * as ${id} from "${prepareFilePath(
					middlewarePath
				)}";`
		)
		.join("\n");

	const middlewareFns = middlewareIdentifiers
		.map(([m]) => `${m}.default`)
		.join(",");

	if (entry.format === "modules") {
		await fs.promises.writeFile(
			dynamicFacadePath,
			dedent/*javascript*/ `
				import worker, * as OTHER_EXPORTS from "${prepareFilePath(entry.file)}";
				${imports}

				export * from "${prepareFilePath(entry.file)}";
				const MIDDLEWARE_TEST_INJECT = "__INJECT_FOR_TESTING_WRANGLER_MIDDLEWARE__";
				export const __INTERNAL_WRANGLER_MIDDLEWARE__ = [
					${process.env.NODE_ENV === "test" ? `...(OTHER_EXPORTS[MIDDLEWARE_TEST_INJECT] ?? []),` : ""}
					${middlewareFns}
				]
				export default worker;
			`
		);

		const targetPathLoader = path.join(
			tmpDirPath,
			"middleware-loader.entry.ts"
		);
		const loaderPath = path.resolve(
			getBasePath(),
			"templates/middleware/loader-modules.ts"
		);

		const baseLoader = await fs.promises.readFile(loaderPath, "utf-8");
		const transformedLoader = baseLoader
			.replaceAll("__ENTRY_POINT__", prepareFilePath(dynamicFacadePath))
			.replace(
				"./common",
				prepareFilePath(
					path.resolve(getBasePath(), "templates/middleware/common.ts")
				)
			);

		await fs.promises.writeFile(targetPathLoader, transformedLoader);

		return {
			entry: {
				...entry,
				file: targetPathLoader,
			},
		};
	} else {
		const loaderSwPath = path.resolve(
			getBasePath(),
			"templates/middleware/loader-sw.ts"
		);

		await fs.promises.writeFile(
			dynamicFacadePath,
			dedent/*javascript*/ `
				import { __facade_registerInternal__ } from "${prepareFilePath(loaderSwPath)}";
				${imports}
				__facade_registerInternal__([${middlewareFns}])
			`
		);

		return {
			entry,
			inject: [dynamicFacadePath],
		};
	}
}

/**
 * Process the given file path to ensure it will work on all OSes.
 *
 * Windows paths contain backslashes, which are taken to be escape characters
 * when inserted directly into source code.
 * This function will escape these backslashes to make sure they work in all OSes.
 *
 */
function prepareFilePath(filePath: string): string {
	return JSON.stringify(filePath).slice(1, -1);
}
