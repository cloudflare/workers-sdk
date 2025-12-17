import { createCommand, createNamespace } from "../core/create-command";
import { logger } from "../logger";
import { handleComplete } from "./complete-handler";
import { getBashScript, getFishScript, getZshScript } from "./scripts";

export const completionsNamespace = createNamespace({
	metadata: {
		description: "⌨️  Generate shell completion scripts",
		owner: "Workers: Authoring and Testing",
		status: "stable",
		epilogue: `Installation:
  bash:  wrangler completions bash >> ~/.bashrc
  zsh:   wrangler completions zsh >> ~/.zshrc
  fish:  wrangler completions fish > ~/.config/fish/completions/wrangler.fish`,
	},
});

export const completionsBashCommand = createCommand({
	metadata: {
		description: "Generate bash completion script",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	behaviour: {
		printBanner: false,
		provideConfig: false,
	},
	handler() {
		logger.log(getBashScript());
	},
});

export const completionsZshCommand = createCommand({
	metadata: {
		description: "Generate zsh completion script",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	behaviour: {
		printBanner: false,
		provideConfig: false,
	},
	handler() {
		logger.log(getZshScript());
	},
});

export const completionsFishCommand = createCommand({
	metadata: {
		description: "Generate fish completion script",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	behaviour: {
		printBanner: false,
		provideConfig: false,
	},
	handler() {
		logger.log(getFishScript());
	},
});

export const completeCommand = createCommand({
	metadata: {
		description: "Output completions for shell integration",
		owner: "Workers: Authoring and Testing",
		status: "stable",
		hidden: true, // Not shown in --help
	},
	behaviour: {
		printBanner: false,
		provideConfig: false,
	},
	positionalArgs: ["args"],
	args: {
		args: {
			type: "string",
			array: true,
			description: "Command line words to complete",
		},
	},
	handler(args) {
		// When -- is used, yargs puts args in _ instead of the positional array
		// and includes the command name "__complete" as first element
		let completionArgs =
			args.args && args.args.length > 0
				? args.args
				: (args as unknown as { _: string[] })._ ?? [];
		// Filter out __complete if it's the first arg (happens with --)
		if (completionArgs[0] === "__complete") {
			completionArgs = completionArgs.slice(1);
		}
		handleComplete(completionArgs);
	},
});
