import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { runBulk } from "../bulk";
import { getFlag, toFlagInput, updateFlag } from "../client";
import { renderFlag } from "../render";

function makeToggleCommand(enabled: boolean) {
	const verb = enabled ? "Enable" : "Disable";
	return createCommand({
		metadata: {
			description: `${verb} a feature flag`,
			status: "open beta",
			owner: "Product: Flagship",
		},
		behaviour: {
			printBanner: (args) => !args.json,
		},
		args: {
			"app-id": {
				type: "string",
				demandOption: true,
				description: "The ID of the app",
			},
			key: {
				type: "string",
				array: true,
				demandOption: true,
				description: `One or more flag keys to ${verb.toLowerCase()}`,
			},
			json: {
				type: "boolean",
				default: false,
				description: "Return output as JSON",
			},
		},
		positionalArgs: ["app-id", "key"],
		async handler(args, { config }) {
			const { appId, key: keys } = args;
			await runBulk(
				keys,
				async (key) => {
					const current = await getFlag(config, appId, key);
					return updateFlag(config, appId, key, {
						...toFlagInput(current),
						enabled,
					});
				},
				{
					json: args.json,
					onSuccess: (flag) => {
						logger.log(`✅ ${verb}d flag\n`);
						logger.log(renderFlag(flag));
					},
				}
			);
		},
	});
}

export const flagshipFlagsEnableCommand = makeToggleCommand(true);
export const flagshipFlagsDisableCommand = makeToggleCommand(false);
