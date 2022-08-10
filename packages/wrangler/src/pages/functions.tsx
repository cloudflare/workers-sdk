import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { FatalError } from "../errors";
import {
	isRoutesJSONSpec,
	optimizeRoutesJSONSpec,
} from "./functions/routes-transformation";
import { pagesBetaWarning } from "./utils";
import type { ArgumentsCamelCase, Argv } from "yargs";

type OptimizeRoutesArgs = {
	"routes-path": string;
	"output-routes-path": string;
};

export function OptimizeRoutesOptions(yargs: Argv): Argv<OptimizeRoutesArgs> {
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
		})
		.epilogue(pagesBetaWarning);
}

export async function OptimizeRoutesHandler({
	routesPath,
	outputRoutesPath,
}: ArgumentsCamelCase<OptimizeRoutesArgs>) {
	// TODO @Carmen do we need to check if this isInPagesCI?
	// TODO @Carmen do we need to check for any auth stuff before we do any of this stuff?

	let routesFileContents: string;

	if (!existsSync(routesPath)) {
		throw new FatalError(
			`Ups! File ${routesPath} does not exist. Please make sure --routes-path is a valid file path (for example "/public/_routes.json")`,
			1
		);
	}

	try {
		routesFileContents = readFileSync(routesPath, "utf-8");
	} catch (err) {
		throw new Error(`Error while reading ${routesPath} file: ${err}`);
	}

	const routes = JSON.parse(routesFileContents);

	if (!isRoutesJSONSpec(routes)) {
		throw new FatalError(
			`
      Invalid _routes.json file found at: ${routesPath}. Please make sure the JSON object has the following format:
      {
        version: 1;
        include: string[];
        exclude: string[];
      }
      `,
			1
		);
	}

	const optimizedRoutes = optimizeRoutesJSONSpec(routes);
	const optimizedRoutesContents = JSON.stringify(optimizedRoutes);

	try {
		// TODO @Carmen do we want to validate if outputRoutesPath exists first?
		// that way we could throw more specific errors depending on whether the
		// folder path is valid or if smth went wrong with writing the file
		writeFileSync(outputRoutesPath, optimizedRoutesContents);
	} catch (err) {
		throw new FatalError(
			`Error writing to file ${outputRoutesPath}. Please make sure the --output-routes-path file path is correct`,
			1
		);
	}
}
