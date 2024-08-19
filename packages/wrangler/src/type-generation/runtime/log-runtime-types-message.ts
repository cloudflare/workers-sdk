import { dedent } from "ts-dedent";
import { logger } from "../../logger";
import { buildUpdatedTypesString } from "../helpers";

/**
 * Constructs a comprehensive log message for the user after generating runtime types.
 */
export function logRuntimeTypesMessage(
	outFile: string,
	tsconfigTypes: string[],
	isNodeCompat = false
) {
	const isWorkersTypesInstalled = tsconfigTypes.find((type) =>
		type.startsWith("@cloudflare/workers-types")
	);
	const isNodeTypesInstalled = tsconfigTypes.find((type) => type === "node");
	const updatedTypesString = buildUpdatedTypesString(tsconfigTypes, outFile);

	logger.info(`✨ Runtime types written to ${outFile}`);

	if (updatedTypesString) {
		logger.info(dedent`
			📣 Add the generated types to the types array in your tsconfig.json:

				{
					"compilerOptions": {
						...
						"types": ${updatedTypesString}
						...
					}
				}

		`);
	} else if (isWorkersTypesInstalled) {
		logger.info(dedent`
			📣 Replace the existing "@cloudflare/workers-types" entry with the generated types path:
				{
					"compilerOptions": {
						...
						"types": ${updatedTypesString}
						...
					}
				}

		`);
	}
	if (isWorkersTypesInstalled) {
		logger.info('📣 You can now uninstall "@cloudflare/workers-types".');
	}
	if (isNodeCompat && !isNodeTypesInstalled) {
		logger.info(
			'📣 It looks like you have some Node.js compatibility turned on in your project. You might want to consider adding Node.js typings with "npm i --save-dev @types/node@20.8.3". Please see the docs for more details: https://developers.cloudflare.com/workers/languages/typescript/#transitive-loading-of-typesnode-overrides-cloudflareworkers-types'
		);
	}
	logger.info(
		"📣 Remember to run 'wrangler types --x-runtime' again if you change 'compatibility_date' or 'compatibility_flags' in your wrangler.toml.\n"
	);
}
