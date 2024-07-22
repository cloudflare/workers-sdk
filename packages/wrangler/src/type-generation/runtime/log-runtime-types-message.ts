import { logger } from "../../logger";

/**
 * Constructs a comprehensive log message for the user after generating runtime types.
 */
export function logRuntimeTypesMessage(
	outFile: string,
	tsconfigTypes: string[],
	isNodeCompat = false
) {
	const isWorkersTypesInstalled = workersTypesEntryExists(tsconfigTypes);
	const updatedTypesString = buildUpdatedTypesString(tsconfigTypes, outFile);

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
			'📣 It looks like you have some node compatibility turned on in your project. You might want to consider adding Node.js typings with "npm i --save-dev @types/node@20.8.3". Please see the docs for more details: https://developers.cloudflare.com/workers/languages/typescript/#transitive-loading-of-typesnode-overrides-cloudflareworkers-types'
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
 * Find any @cloudflare/workers-types entry in the tsconfig.json types array.
 */
function workersTypesEntryExists(types: string[]): boolean {
	return Boolean(
		types.find((type) => type.startsWith("@cloudflare/workers-types"))
	);
}
