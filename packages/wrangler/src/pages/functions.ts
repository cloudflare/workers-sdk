import { existsSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { FatalError } from "@cloudflare/workers-utils";
import { createCommand } from "../core/create-command";
import { optimizeRoutesJSONSpec } from "./functions/routes-transformation";
import { validateRoutes } from "./functions/routes-validation";

export const pagesFunctionsOptimizeRoutesCommand = createCommand({
	metadata: {
		description:
			"Consolidate and optimize route paths declared in _routes.json",
		status: "stable",
		owner: "Workers: Authoring and Testing",
		hidden: true,
	},
	behaviour: {
		provideConfig: false,
	},
	args: {
		routesPath: {
			type: "string",
			demandOption: true,
			description: "The location of the _routes.json file",
		},
		outputRoutesPath: {
			type: "string",
			demandOption: true,
			description: "The location of the optimized output routes file",
		},
	},
	async handler({ routesPath, outputRoutesPath }) {
		let routesFileContents: string;
		const routesOutputDirectory = path.dirname(outputRoutesPath);

		if (!existsSync(routesPath)) {
			throw new FatalError(
				`Oops! File ${routesPath} does not exist. Please make sure --routes-path is a valid file path (for example "/public/_routes.json").`,
				1
			);
		}

		if (
			!lstatSync(routesOutputDirectory, {
				throwIfNoEntry: false,
			})?.isDirectory()
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
	},
});
