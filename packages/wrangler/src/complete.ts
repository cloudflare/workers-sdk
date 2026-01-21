import t from "@bomb.sh/tab";
import { CommandLineArgsError } from "@cloudflare/workers-utils";
import { createCommand } from "./core/create-command";
import { experimental_getWranglerCommands } from "./experimental-commands-api";
import type { DefinitionTreeNode } from "./core/types";

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
						"private beta": "[private beta]",
						"open beta": "[open beta]",
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

export const completionsCommand = createCommand({
	metadata: {
		description: "⌨️ Generate and handle shell completions",
		owner: "Workers: Authoring and Testing",
		status: "stable",
		examples: [
			{
				description: "Generate bash completion script",
				command: "wrangler complete bash",
			},
			{
				description: "Generate fish completion script",
				command: "wrangler complete fish",
			},
			{
				description: "Generate powershell completion script",
				command: "wrangler complete powershell",
			},
			{
				description: "Generate zsh completion script",
				command: "wrangler complete zsh",
			},
		],
	},
	behaviour: {
		printBanner: false,
		provideConfig: false,
	},
	positionalArgs: ["shell"],
	args: {
		shell: {
			choices: ["bash", "fish", "powershell", "zsh"],
			describe: "Shell type to generate completions for",
			type: "string",
		},
	},
	handler(args) {
		// When shells request completions, they call: wrangler complete -- <partial-command>
		// Yargs puts everything after -- into the _ array
		const rawArgs = (args as unknown as { _: string[] })._ ?? [];

		const completionArgs = rawArgs.slice(rawArgs[0] === "complete" ? 1 : 0);

		if (completionArgs.length > 0) {
			setupCompletions();
			t.parse(completionArgs);
			return;
		}

		if (!args.shell) {
			throw new CommandLineArgsError("Missing required argument: shell");
		}

		setupCompletions();
		t.setup("wrangler", "wrangler", args.shell);
	},
});
