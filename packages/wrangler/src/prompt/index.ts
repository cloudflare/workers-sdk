import { execa } from "execa";
import { createCommand } from "../core/create-command";
import { generateOpencodeConfig } from "./config-generator";
import {
	detectOpencode,
	installOpencode,
	isOpencodeVersionCompatible,
	upgradeOpencode,
} from "./opencode-manager";

export const promptCommand = createCommand({
	metadata: {
		description: "🤖 Launch AI assistant (opencode)",
		status: "experimental",
		owner: "Workers: Authoring and Testing",
	},
	behaviour: {
		printConfigWarnings: false,
	},
	args: {
		auth: {
			type: "string",
			description: "Authenticate with opencode (default: login)",
			choices: ["login", "logout", "list"],
			coerce: (v) => v || "login",
		},
		prompt: {
			type: "string",
			description: "Optional starting prompt",
		},
	},
	positionalArgs: ["prompt"],
	async handler(args, { logger }) {
		const ocVersion = await detectOpencode();
		if (ocVersion) {
			if (!isOpencodeVersionCompatible(ocVersion)) {
				logger.log("opencode is not compatible. Upgrading...");
				await upgradeOpencode();
			}
		} else {
			logger.log("opencode not found. Installing...");
			await installOpencode();
		}

		if (args.auth) {
			await execa("opencode", ["auth", args.auth], { stdio: "inherit" });
			return;
		}

		const configPath = await generateOpencodeConfig(process.cwd());
		logger.debug(`Generated opencode configuration at: ${configPath}`);

		const opencodeArgs: string[] = ["--agent", "cloudflare"];

		if (args.prompt) {
			opencodeArgs.push("--prompt", args.prompt);
		}

		await execa("opencode", opencodeArgs, {
			stdio: "inherit",
			env: {
				...process.env,
				OPENCODE_CONFIG: configPath,
			},
		});
	},
});
