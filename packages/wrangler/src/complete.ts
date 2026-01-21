import t from "@bomb.sh/tab";
import { experimental_getWranglerCommands } from "./experimental-commands-api";
import type { DefinitionTreeNode } from "./core/types";

function setupCompletions() {
	const { registry, globalFlags } = experimental_getWranglerCommands();

	// global flags that work on every command
	for (const [flagName, flagDef] of Object.entries(globalFlags)) {
		// skip hidden flags
		if ("hidden" in flagDef && flagDef.hidden) continue;

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

	// recursively add commands from the registry tree
	function addCommandsFromTree(
		node: DefinitionTreeNode,
		parentPath: string[] = []
	) {
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
							if (argDef.hidden) continue;

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

	return t;
}
// Handle completion requests from the shell
export function handleCompletion(args: string[]) {
	const shell = args[0];

	if (shell === "--") {
		// Parse completion request from shell
		setupCompletions();
		t.parse(args.slice(1));
	} else {
		// Generate shell completion script
		setupCompletions();
		t.setup("wrangler", "wrangler", shell);
	}
}
