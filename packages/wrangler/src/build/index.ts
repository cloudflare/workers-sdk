import { UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../core/create-command";
import {
	experimentalCfBuildOutputArg,
	experimentalNewConfigArg,
} from "../experimental-config/cli-flag";
import { createCLIParser } from "../index";
import { runBuildOutput } from "./run-build-output";

export const buildCommand = createCommand({
	metadata: {
		description: "🔨 Build a Worker",
		owner: "Workers: Authoring and Testing",
		status: "stable",
		hidden: true,
	},
	behaviour: {
		printBanner: false,
		provideConfig: false,
		suggestSkillsAfterHandler: true,
	},
	args: {
		...experimentalNewConfigArg,
		...experimentalCfBuildOutputArg,
	},
	validateArgs(args) {
		if (args.experimentalCfBuildOutput && !args.experimentalNewConfig) {
			throw new UserError(
				"`--experimental-cf-build-output` requires `--experimental-new-config`.",
				{ telemetryMessage: "build-output requires new config" }
			);
		}
	},
	async handler(buildArgs) {
		if (buildArgs.experimentalCfBuildOutput) {
			await runBuildOutput(buildArgs);
			return;
		}

		const { wrangler } = createCLIParser([
			"deploy",
			"--dry-run",
			"--outdir=dist",
			...(buildArgs.env ? ["--env", buildArgs.env] : []),
			...(buildArgs.config ? ["--config", buildArgs.config] : []),
			...(buildArgs.experimentalNewConfig ? ["--experimental-new-config"] : []),
		]);
		await wrangler.parse();
	},
});
