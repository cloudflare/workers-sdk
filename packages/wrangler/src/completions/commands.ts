import t from "@bomb.sh/tab";
import { createCommand, createNamespace } from "../core/create-command";
import { experimental_getWranglerCommands } from "../experimental-commands-api";
import type { DefinitionTreeNode } from "../core/types";

export const completionsNamespace = createNamespace({
	metadata: {
		description: "⌨️ Generate and handle shell completions",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
});

function setupCompletions(): void {
	const { registry, globalFlags } = experimental_getWranglerCommands();

	// Global flags that work on every command
	for (const [flagName, flagDef] of Object.entries(globalFlags)) {
		if ("hidden" in flagDef && flagDef.hidden) {
			continue;
		}

		const description = flagDef.describe || "";
		t.option(flagName, description);

		if ("alias" in flagDef && flagDef.alias) {
			const aliases = Array.isArray(flagDef.alias)
				? flagDef.alias
				: [flagDef.alias];
			for (const alias of aliases) {
				t.option(alias, `Alias for --${flagName}`);
			}
		}
	}

	// Recursively add commands from the registry tree
	function addCommandsFromTree(
		node: DefinitionTreeNode,
		parentPath: string[] = []
	): void {
		for (const [name, childNode] of node.subtree.entries()) {
			const commandPath = [...parentPath, name];
			const commandName = commandPath.join(" ");

			if (childNode.definition) {
				const def = childNode.definition;
				let description = "";

				if (def.metadata?.description) {
					description = def.metadata.description;
				}

				if (
					def.metadata?.status &&
					def.metadata.status !== "stable" &&
					!def.metadata.hidden
				) {
					const statusLabels = {
						experimental: "[experimental]",
						alpha: "[alpha]",
						"private-beta": "[private-beta]",
						"open-beta": "[open-beta]",
					};
					const statusLabel =
						statusLabels[def.metadata.status as keyof typeof statusLabels];
					if (statusLabel) {
						description = `${description} ${statusLabel}`;
					}
				}

				if (!def.metadata?.hidden) {
					const cmd = t.command(commandName, description);

					if (def.type === "command" && "args" in def) {
						const args = def.args || {};
						for (const [argName, argDef] of Object.entries(args)) {
							if (argDef.hidden) {
								continue;
							}

							const argDescription = argDef.describe || "";

							if (argDef.choices && Array.isArray(argDef.choices)) {
								cmd.option(argName, argDescription, (complete) => {
									for (const choice of argDef.choices as string[]) {
										complete(choice, choice);
									}
								});
							} else {
								cmd.option(argName, argDescription);
							}

							if (argDef.alias) {
								const aliases = Array.isArray(argDef.alias)
									? argDef.alias
									: [argDef.alias];
								for (const alias of aliases) {
									cmd.option(alias, `Alias for --${argName}`);
								}
							}
						}
					}
				}
			}

			if (childNode.subtree.size > 0) {
				addCommandsFromTree(childNode, commandPath);
			}
		}
	}

	addCommandsFromTree(registry);
}

export const completeBashCommand = createCommand({
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
		setupCompletions();
		t.setup("wrangler", "wrangler", "bash");
	},
});

export const completeZshCommand = createCommand({
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
		setupCompletions();
		t.setup("wrangler", "wrangler", "zsh");
	},
});

export const completeFishCommand = createCommand({
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
		setupCompletions();
		t.setup("wrangler", "wrangler", "fish");
	},
});

export const completePowershellCommand = createCommand({
	metadata: {
		description: "Generate PowerShell completion script",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	behaviour: {
		printBanner: false,
		provideConfig: false,
	},
	handler() {
		setupCompletions();
		t.setup("wrangler", "wrangler", "powershell");
	},
});

export const completeInternalCommand = createCommand({
	metadata: {
		description: "Output completions for shell integration (internal use)",
		owner: "Workers: Authoring and Testing",
		status: "stable",
		hidden: true,
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
			describe: "Command line words to complete",
		},
	},
	handler(args) {
		// When -- is used, yargs puts args in _ instead of the positional array
		// and includes the command name as first element
		let completionArgs =
			args.args && args.args.length > 0
				? args.args
				: (args as unknown as { _: string[] })._ ?? [];

		// Filter out the command name if it's the first arg
		if (
			completionArgs[0] === "__complete" ||
			completionArgs[0] === "complete"
		) {
			completionArgs = completionArgs.slice(1);
		}

		setupCompletions();
		t.parse(completionArgs);
	},
});
