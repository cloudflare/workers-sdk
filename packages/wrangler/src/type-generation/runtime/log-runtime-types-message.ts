import { existsSync, readFileSync } from "fs";
import { logger } from "../../logger";
import { parseJSONC } from "../../parse";

/**
 * Constructs a comprehensive log message for the user after generating runtime types.
 */
export function logRuntimeTypesMessage(
	outFile: string,
	tsconfigPath: string,
	isNodeCompat = false
) {
	const existingTypes = readExistingTypes(tsconfigPath);
	const isWorkersTypesInstalled = workersTypesEntryExists(existingTypes);
	const updatedTypesString = buildUpdatedTypesString(existingTypes, outFile);

	const message = isWorkersTypesInstalled
		? `\n📣 Replace the existing "@cloudflare/workers-types" entry with the generated types path:`
		: "📣 Add the generated types to the types array in your tsconfig.json:";

	logger.info(`
✨ Runtime types written to ${outFile}
${message}

{
	"compilerOptions": {
	    ...
		"types": ${updatedTypesString}
		...
	}
}
    `);
	if (isWorkersTypesInstalled) {
		logger.info('📣 You can now uninstall "@cloudflare/workers-types".');
	}
	if (isNodeCompat) {
		logger.info(
			'📣 To get Node.js typings, install with "npm i --save-dev @types/node".'
		);
	}
	logger.info(
		"📣 Remember to run 'wrangler types --x-with-runtime' again if you change 'compatibility_date' or 'compatibility_flags' in your wrangler.toml.\n"
	);
}

/**
 * Constructs a string representation of the existing types array with the new types path appended to.
 * It removes any existing types that are no longer relevant.
 */
function buildUpdatedTypesString(
	types: string[],
	newTypesPath: string
): string {
	const updatedTypesArray = types
		.filter(
			(type) =>
				!type.startsWith("@cloudflare/workers-types") &&
				!type.includes(".wrangler/types/runtime")
		)
		.concat([newTypesPath]);

	return JSON.stringify(updatedTypesArray);
}

/**
 * Attempts to read the tsconfig.json at the current path.
 */
function readExistingTypes(tsconfigPath: string): string[] {
	if (!existsSync(tsconfigPath)) {
		return [];
	}

	try {
		const tsconfig = parseJSONC<TSConfig>(readFileSync(tsconfigPath, "utf-8"));
		return tsconfig.compilerOptions?.types || [];
	} catch (e) {
		return [];
	}
}

type TSConfig = {
	compilerOptions: {
		types: string[];
	};
};

/**
 * Find any @cloudflare/workers-types entry in the tsconfig.json types array.
 */
function workersTypesEntryExists(types: string[]): boolean {
	return Boolean(
		types.find((type) => type.startsWith("@cloudflare/workers-types"))
	);
}
