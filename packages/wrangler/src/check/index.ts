import { spawn } from "node:child_process";
import path from "node:path";
import dedent from "ts-dedent";
import { readConfig } from "../config";
import { UserError } from "../errors";
import { readTsconfigTypes } from "../type-generation";
import { generateRuntimeTypes } from "../type-generation/runtime";
import { buildUpdatedTypesString } from "../type-generation/runtime/log-runtime-types-message";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

export function checkOptions(yargs: CommonYargsArgv) {
	return yargs;
}

export async function checkHandler(
	args: StrictYargsOptionsToInterface<typeof checkOptions>
) {
	const config = readConfig(undefined, args);

	const tsconfig =
		config.tsconfig ??
		(config.configPath
			? path.join(path.dirname(config.configPath), "tsconfig.json")
			: undefined);

	if (!tsconfig) {
		throw new UserError("No tsconfig.json file found");
	}

	const { outFile } = await generateRuntimeTypes({
		config,
	});

	const tsconfigTypes = readTsconfigTypes(tsconfig);

	const updatedTypesString = buildUpdatedTypesString(tsconfigTypes, outFile);

	if (updatedTypesString) {
		throw new UserError(dedent`
			Update your tsconfig:

				{
					"compilerOptions": {
						...
						"types": ${updatedTypesString}
						...
					}
				}

		`);
	}

	const tsPath = path.resolve(require.resolve("typescript"), "../../bin/tsc");

	spawn(tsPath, ["--project", tsconfig], {
		stdio: "inherit",
	}).on("exit", (code) =>
		process.exit(code === undefined || code === null ? 0 : code)
	);
}
