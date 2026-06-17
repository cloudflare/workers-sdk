import { createCommand } from "../core/create-command";
import { experimentalNewConfigArg } from "../experimental-config/cli-flag";
import { createCLIParser } from "../index";

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
	},
	async handler(buildArgs) {
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
