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

/**
 * `@bomb.sh/tab`'s `t.setup()` always writes the generated completion script
 * via `console.log()`. Capture that output instead of letting it print
 * directly, so it can be patched for the multi-word `--executable-name` case.
 */
function captureCompletionScript(
	identifier: string,
	invocation: string,
	shell: string
): string {
	// eslint-disable-next-line no-console -- capturing @bomb.sh/tab's own console.log call, not logging
	const originalLog = console.log;
	const lines: string[] = [];
	// eslint-disable-next-line no-console -- see above
	console.log = (message?: unknown) => {
		lines.push(String(message));
	};
	try {
		t.setup(identifier, invocation, shell);
	} finally {
		// eslint-disable-next-line no-console -- see above
		console.log = originalLog;
	}
	return lines.join("\n");
}

const UNSUPPORTED_SCRIPT_FORMAT_MESSAGE =
	"Unable to generate a completion script for this --executable-name: the generated script did not have the expected format. This can happen if the @bomb.sh/tab dependency changed its generated script format.";

function replaceExactlyOnce(
	script: string,
	needle: string,
	replacement: string
): string {
	const occurrences = script.split(needle).length - 1;
	if (occurrences !== 1) {
		throw new CommandLineArgsError(UNSUPPORTED_SCRIPT_FORMAT_MESSAGE, {
			telemetryMessage:
				"cli completions multi-word executable name unsupported",
		});
	}
	return script.replace(needle, replacement);
}

function replaceAllExpected(
	script: string,
	needle: string,
	replacement: string,
	expectedCount: number
): string {
	const occurrences = script.split(needle).length - 1;
	if (occurrences !== expectedCount) {
		throw new CommandLineArgsError(UNSUPPORTED_SCRIPT_FORMAT_MESSAGE, {
			telemetryMessage:
				"cli completions multi-word executable name unsupported",
		});
	}
	return script.split(needle).join(replacement);
}

/**
 * Shells can only ever register a completion handler against the first word
 * a user types (`complete -F fn npx`, `compdef _fn npx`, etc.) - none of them
 * support registering against a literal multi-word command like "npx wrangler".
 *
 * So when `--executable-name` is more than one word, this registers against
 * the first word (e.g. "npx") and patches the generated script to bail out
 * unless the following word(s) match the rest of the invocation (e.g.
 * "wrangler"), stripping those matched word(s) out of the shell's captured
 * word list before the rest of the (unmodified) generated logic runs - that
 * logic always assumes exactly one leading word to skip.
 *
 * This also fixes registering against a mismatched, sanitized identifier for
 * *single*-word executable names containing characters (e.g. "-") that get
 * replaced when deriving internal function/variable names.
 */
function patchExecutableTarget(
	script: string,
	shell: string,
	identifierName: string,
	outerCommand: string,
	remainingWords: string[]
): string {
	const remaining = remainingWords.join(" ");
	const n = remainingWords.length;

	switch (shell) {
		case "bash": {
			if (n > 0) {
				const anchor = `_get_comp_words_by_ref -n "=:" cur prev words cword`;
				script = replaceExactlyOnce(
					script,
					anchor,
					`${anchor}\n\n    if [[ "\${COMP_WORDS[*]:1:${n}}" != "${remaining}" ]]; then\n        return\n    fi\n    words=("\${words[0]}" "\${words[@]:${n + 1}}")\n    cword=$((cword - ${n}))`
				);
			}
			script = replaceExactlyOnce(
				script,
				`complete -F __${identifierName}_complete ${identifierName}`,
				`complete -F __${identifierName}_complete ${outerCommand}`
			);
			break;
		}
		case "zsh": {
			if (n > 0) {
				const anchor = `words=( "\${=words[1,CURRENT]}" )`;
				script = replaceExactlyOnce(
					script,
					anchor,
					`${anchor}\n\n    if [[ "\${words[2,${n + 1}]}" != "${remaining}" ]]; then\n        return\n    fi\n    words=("\${words[1]}" "\${words[${n + 2},-1]}")\n    CURRENT=$((CURRENT - ${n}))`
				);
			}
			script = replaceExactlyOnce(
				script,
				`#compdef ${identifierName}`,
				`#compdef ${outerCommand}`
			);
			script = replaceExactlyOnce(
				script,
				`compdef _${identifierName} ${identifierName}`,
				`compdef _${identifierName} ${outerCommand}`
			);
			break;
		}
		case "fish": {
			if (n > 0) {
				const anchor = `set -l args (commandline -opc)`;
				const sliceEnd = n + 1;
				script = replaceExactlyOnce(
					script,
					anchor,
					`${anchor}\n\n    if test (string join ' ' -- $args[2..${sliceEnd}]) != "${remaining}"\n        return 1\n    end\n    set -e args[2..${sliceEnd}]`
				);
			}
			script = replaceAllExpected(
				script,
				`complete -c ${identifierName}`,
				`complete -c ${outerCommand}`,
				3
			);
			script = replaceExactlyOnce(
				script,
				`complete -k -c ${identifierName}`,
				`complete -k -c ${outerCommand}`
			);
			script = replaceExactlyOnce(
				script,
				`type -q "${identifierName}"`,
				`type -q "${outerCommand}"`
			);
			script = replaceExactlyOnce(
				script,
				`complete --do-complete "${identifierName} "`,
				`complete --do-complete "${outerCommand} "`
			);
			break;
		}
		case "powershell": {
			if (n > 0) {
				const anchor = `$Program, $Arguments = $Command.Split(" ", 2)`;
				let guard = "";
				for (const word of remainingWords) {
					guard += `\n    if ($Arguments -notlike "${word} *" -and $Arguments -ne "${word}") { return }\n    $Arguments = $Arguments.Substring(${word.length}).TrimStart()`;
				}
				script = replaceExactlyOnce(script, anchor, `${anchor}${guard}`);
			}
			script = replaceExactlyOnce(
				script,
				`Register-ArgumentCompleter -CommandName '${identifierName}'`,
				`Register-ArgumentCompleter -CommandName '${outerCommand}'`
			);
			break;
		}
	}

	return script;
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
		"executable-name": {
			describe:
				"Override the executable name used in the generated completion script (e.g. 'npx wrangler')",
			type: "string",
			requiresArg: true,
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
			throw new CommandLineArgsError("Missing required argument: shell", {
				telemetryMessage: "cli completions missing shell",
			});
		}

		const executableName = args.executableName ?? "wrangler";

		if (!/^[a-zA-Z0-9 \-_./@]+$/.test(executableName)) {
			throw new CommandLineArgsError(
				`Invalid --executable-name value: "${executableName}". Only alphanumeric characters, spaces, hyphens, underscores, dots, slashes, and @ are allowed.`,
				{ telemetryMessage: "cli completions invalid executable name" }
			);
		}

		setupCompletions();

		// Leave the common default path untouched: no capturing/patching, just
		// print directly, to avoid any risk of regressing it.
		if (executableName === "wrangler") {
			t.setup("wrangler", "wrangler", args.shell);
			return;
		}

		const words = executableName.trim().split(/\s+/);
		const outerCommand = words[0];
		const remainingWords = words.slice(1);
		// Internal function/variable names must be valid identifiers; the
		// registration target (below) uses the literal words instead.
		const identifierName = executableName.replace(/[^a-zA-Z0-9]/g, "_");

		const script = captureCompletionScript(
			identifierName,
			executableName,
			args.shell
		);
		// eslint-disable-next-line no-console -- matches @bomb.sh/tab's own console.log for this raw script output
		console.log(
			patchExecutableTarget(
				script,
				args.shell,
				identifierName,
				outerCommand,
				remainingWords
			)
		);
	},
});
