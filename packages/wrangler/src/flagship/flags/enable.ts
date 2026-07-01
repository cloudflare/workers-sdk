import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { runBulk, splitAppIdAndKeys } from "../bulk";
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
			target: {
				type: "string",
				array: true,
				demandOption: true,
				description: `The app ID followed by one or more flag keys to ${verb.toLowerCase()}`,
			},
			json: {
				type: "boolean",
				default: false,
				description: "Return output as JSON",
			},
		},
		positionalArgs: ["target"],
		async handler(args, { config }) {
			const { appId, keys } = splitAppIdAndKeys(args.target);
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
