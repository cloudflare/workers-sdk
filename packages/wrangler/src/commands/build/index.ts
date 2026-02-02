import { createCommand } from "../../core/create-command";
import { createCLIParser } from "../../index";

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
	},
	async handler(buildArgs) {
		const { wrangler } = createCLIParser([
			"deploy",
			"--dry-run",
			"--outdir=dist",
			...(buildArgs.env ? ["--env", buildArgs.env] : []),
			...(buildArgs.config ? ["--config", buildArgs.config] : []),
		]);
		await wrangler.parse();
	},
});
