import { createCommand } from "../core/create-command";
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
	},
	args: {
		"write-workerd-config": {
			type: "string",
			describe:
				"Path to write a workerd capnp config for running the built worker in workerd",
			requiresArg: true,
		},
	},
	async handler(buildArgs) {
		const argv = [
			"deploy",
			"--dry-run",
			"--outdir=dist",
			...(buildArgs.env ? ["--env", buildArgs.env] : []),
			...(buildArgs.config ? ["--config", buildArgs.config] : []),
			...(buildArgs.writeWorkerdConfig
				? ["--write-workerd-config", buildArgs.writeWorkerdConfig as string]
				: []),
		];
		const { wrangler } = createCLIParser(argv);
		await wrangler.parse();
	},
});
