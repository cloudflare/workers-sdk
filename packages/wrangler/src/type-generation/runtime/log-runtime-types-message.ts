import { existsSync } from "node:fs";
import chalk from "chalk";
import * as find from "empathic/find";
import { logger } from "../../logger";

/**
 * Constructs a comprehensive log message for the user after generating runtime types.
 */
export function logRuntimeTypesMessage(
	tsconfigTypes: string[],
	isNodeCompat = false
) {
	const isWorkersTypesInstalled = tsconfigTypes.find((type) =>
		type.startsWith("@cloudflare/workers-types")
	);

	const maybeHasOldRuntimeFile = existsSync("./.wrangler/types/runtime.d.ts");
	if (maybeHasOldRuntimeFile) {
		logAction("Remove the old runtime.d.ts file");
		logger.log(
			chalk.dim(
				"`wrangler types` now outputs runtime and Env types in one file.\nYou can now delete the ./.wrangler/types/runtime.d.ts and update your tsconfig.json`"
			)
		);
		logger.log("");
	}
	if (isWorkersTypesInstalled) {
		logAction(
			"Migrate from @cloudflare/workers-types to generated runtime types"
		);
		logger.log(
			chalk.dim(
				"`wrangler types` now generates runtime types and supersedes @cloudflare/workers-types.\nYou should now uninstall @cloudflare/workers-types and remove it from your tsconfig.json."
			)
		);
		logger.log("");
	}

	let isNodeTypesInstalled = Boolean(
		tsconfigTypes.find((type) => type === "node")
	);

	if (!isNodeTypesInstalled && isNodeCompat) {
		const nodeModules = find.dir("node_modules/@types/node");
		if (nodeModules) {
			isNodeTypesInstalled = true;
		}
	}
	if (isNodeCompat && !isNodeTypesInstalled) {
		logAction("Install @types/node");
		logger.log(
			chalk.dim(
				`Since you have the \`nodejs_compat\` flag, you should install Node.js types by running "npm i --save-dev @types/node".`
			)
		);
		logger.log("");
	}

	logger.log(
		`📖 Read about runtime types\n` +
			`${chalk.dim("https://developers.cloudflare.com/workers/languages/typescript/#generate-types")}`
	);
}

const logAction = (msg: string) => {
	logger.log(chalk.hex("#BD5B08").bold("Action required"), msg);
};
