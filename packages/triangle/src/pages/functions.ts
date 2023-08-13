import { existsSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { FatalError } from "../errors";
import { optimizeRoutesJSONSpec } from "./functions/routes-transformation";
import { validateRoutes } from "./functions/routes-validation";

import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

type OptimizeRoutesArgs = StrictYargsOptionsToInterface<
	typeof OptimizeRoutesOptions
>;

export function OptimizeRoutesOptions(yargs: CommonYargsArgv) {
	return yargs
		.options({
			"routes-path": {
				type: "string",
				demandOption: true,
				description: "The location of the _routes.json file",
			},
		})
		.options({
			"output-routes-path": {
				type: "string",
				demandOption: true,
				description: "The location of the optimized output routes file",
			},
		});
}

export async function OptimizeRoutesHandler({
	routesPath,
	outputRoutesPath,
}: OptimizeRoutesArgs) {
<<<<<<< HEAD:packages/triangle/src/pages/functions.ts
	if (!isInPagesCI) {
		// Beta message for `triangle pages <commands>` usage
		logger.log(pagesBetaWarning);
	}

=======
>>>>>>> da9ba3c855317c6071eb892def4965706f2fb97f:packages/wrangler/src/pages/functions.ts
	let routesFileContents: string;
	const routesOutputDirectory = path.dirname(outputRoutesPath);

	if (!existsSync(routesPath)) {
		throw new FatalError(
			`Oops! File ${routesPath} does not exist. Please make sure --routes-path is a valid file path (for example "/public/_routes.json").`,
			1
		);
	}

	if (
		!existsSync(routesOutputDirectory) ||
		!lstatSync(routesOutputDirectory).isDirectory()
	) {
		throw new FatalError(
			`Oops! Folder ${routesOutputDirectory} does not exist. Please make sure --output-routes-path is a valid file path (for example "/public/_routes.json").`,
			1
		);
	}

	try {
		routesFileContents = readFileSync(routesPath, "utf-8");
	} catch (err) {
		throw new FatalError(`Error while reading ${routesPath} file: ${err}`);
	}

	const routes = JSON.parse(routesFileContents);

	validateRoutes(routes, routesPath);

	const optimizedRoutes = optimizeRoutesJSONSpec(routes);
	const optimizedRoutesContents = JSON.stringify(optimizedRoutes);

	try {
		writeFileSync(outputRoutesPath, optimizedRoutesContents);
	} catch (err) {
		throw new FatalError(
			`Error writing to ${outputRoutesPath} file: ${err}`,
			1
		);
	}
}
