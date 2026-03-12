import * as readline from "node:readline";
import { UserError } from "@cloudflare/workers-utils";
import chalk from "chalk";
import { createCommand } from "../core/create-command";
import isInteractive from "../is-interactive";
import { logger } from "../logger";
import { chatCompletions, getInstance, getInstanceStats } from "./client";
import type { AiSearchMessage } from "./types";
import type { Config } from "@cloudflare/workers-utils";

interface PlaygroundState {
	model: string | undefined;
	systemPrompt: string | undefined;
	filters: Record<string, string>;
	history: AiSearchMessage[];
}

function printBanner(instanceName: string, state: PlaygroundState): void {
	const lines = [
		chalk.cyan("-- AI Search Playground " + "-".repeat(30)),
		`  Instance:  ${chalk.bold(instanceName)}`,
	];
	if (state.model) {
		lines.push(`  Model:     ${chalk.bold(state.model)}`);
	}
	if (state.systemPrompt) {
		lines.push(
			`  System:    ${chalk.dim(state.systemPrompt.length > 50 ? state.systemPrompt.slice(0, 50) + "..." : state.systemPrompt)}`
		);
	}
	if (Object.keys(state.filters).length > 0) {
		const filterStr = Object.entries(state.filters)
			.map(([k, v]) => `${k}=${v}`)
			.join(", ");
		lines.push(`  Filters:   ${chalk.dim(filterStr)}`);
	}
	lines.push("");
	lines.push(`  Type a message or ${chalk.bold("/help")} for commands`);
	lines.push(chalk.cyan("-".repeat(54)));
	logger.log(lines.join("\n"));
}

function printHelp(): void {
	logger.log(
		[
			"",
			chalk.bold("Available commands:"),
			`  ${chalk.cyan("/model")} <model>     Change the LLM model`,
			`  ${chalk.cyan("/system")} <prompt>   Set/update system prompt`,
			`  ${chalk.cyan("/clear")}             Clear conversation history and screen`,
			`  ${chalk.cyan("/stats")}             Show instance stats`,
			`  ${chalk.cyan("/filter")} key=value  Add a metadata filter`,
			`  ${chalk.cyan("/filter clear")}      Clear all filters`,
			`  ${chalk.cyan("/help")}              Show this help`,
			`  ${chalk.cyan("/quit")}              Exit the playground`,
			"",
		].join("\n")
	);
}

async function handleSlashCommand(
	input: string,
	state: PlaygroundState,
	instanceName: string,
	config: Config
): Promise<boolean> {
	const parts = input.split(/\s+/);
	const cmd = parts[0].toLowerCase();
	const rest = input.slice(cmd.length).trim();

	switch (cmd) {
		case "/quit":
		case "/exit":
		case "/q":
			return true;

		case "/help":
			printHelp();
			break;

		case "/model":
			if (rest) {
				state.model = rest;
				logger.log(chalk.green(`Model set to: ${rest}`));
			} else {
				logger.log(
					state.model
						? `Current model: ${state.model}`
						: "No model override set (using instance default)."
				);
			}
			break;

		case "/system":
			if (rest) {
				state.systemPrompt = rest;
				logger.log(chalk.green("System prompt updated."));
			} else {
				logger.log(
					state.systemPrompt
						? `Current system prompt: ${state.systemPrompt}`
						: "No system prompt set."
				);
			}
			break;

		case "/clear":
			state.history = [];
			// Clear terminal
			process.stdout.write("\x1B[2J\x1B[0f");
			printBanner(instanceName, state);
			break;

		case "/stats": {
			const stats = await getInstanceStats(config, instanceName);
			logger.log(
				`\n  Completed: ${stats.completed}  |  Errors: ${stats.error}  |  ` +
					`In Progress: ${stats.in_progress}  |  Pending: ${stats.pending}  |  ` +
					`Total: ${stats.total}`
			);
			break;
		}

		case "/filter":
			if (rest === "clear") {
				state.filters = {};
				logger.log(chalk.green("All filters cleared."));
			} else if (rest) {
				const eqIndex = rest.indexOf("=");
				if (eqIndex === -1) {
					logger.warn("Invalid filter format. Use: /filter key=value");
				} else {
					const key = rest.slice(0, eqIndex);
					const value = rest.slice(eqIndex + 1);
					state.filters[key] = value;
					logger.log(chalk.green(`Filter added: ${key}=${value}`));
				}
			} else {
				if (Object.keys(state.filters).length === 0) {
					logger.log("No filters set.");
				} else {
					logger.log("Current filters:");
					for (const [k, v] of Object.entries(state.filters)) {
						logger.log(`  ${k}=${v}`);
					}
				}
			}
			break;

		default:
			logger.warn(
				`Unknown command: ${cmd}. Type /help for available commands.`
			);
			break;
	}
	return false;
}

async function handleChatInput(
	input: string,
	state: PlaygroundState,
	instanceName: string,
	config: Config
): Promise<void> {
	// Build messages with history
	const messages: AiSearchMessage[] = [];
	if (state.systemPrompt) {
		messages.push({ role: "system", content: state.systemPrompt });
	}
	messages.push(...state.history);
	messages.push({ role: "user", content: input });

	const filters =
		Object.keys(state.filters).length > 0 ? state.filters : undefined;

	const result = await chatCompletions(config, instanceName, {
		messages,
		model: state.model,
		filters,
	});

	const answer = result.choices?.[0]?.message?.content;
	if (answer) {
		// Token-by-token output simulation for non-streaming API
		for (const char of answer) {
			process.stdout.write(char);
			// Small delay to simulate streaming feel
		}
		process.stdout.write("\n");

		// Update conversation history
		state.history.push({ role: "user", content: input });
		state.history.push({ role: "assistant", content: answer });
	} else {
		logger.log("(No response generated)");
	}
}

export const aiSearchPlaygroundCommand = createCommand({
	metadata: {
		description: "Interactive TUI for testing AI Search chat completions",
		status: "open beta",
		owner: "Product: AI",
	},
	behaviour: {
		printBanner: false,
	},
	args: {
		name: {
			type: "string",
			demandOption: true,
			description: "The name of the AI Search instance.",
		},
		model: {
			type: "string",
			description: "Override the LLM model for chat mode.",
		},
		"system-prompt": {
			type: "string",
			description: "System prompt for chat mode.",
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		if (!isInteractive()) {
			throw new UserError(
				"The playground command requires an interactive terminal.\n" +
					"Use 'wrangler ai-search search' or 'wrangler ai-search chat' for non-interactive usage."
			);
		}

		// Validate instance exists
		const instance = await getInstance(config, args.name);
		if (!instance) {
			throw new UserError(`AI Search instance "${args.name}" not found.`);
		}

		const state: PlaygroundState = {
			model: args.model ?? instance.ai_search_model,
			systemPrompt: args.systemPrompt,
			filters: {},
			history: [],
		};

		printBanner(args.name, state);

		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
			prompt: chalk.cyan("you> "),
		});

		rl.prompt();

		rl.on("line", async (line: string) => {
			const input = line.trim();
			if (!input) {
				rl.prompt();
				return;
			}

			try {
				if (input.startsWith("/")) {
					const shouldExit = await handleSlashCommand(
						input,
						state,
						args.name,
						config
					);
					if (shouldExit) {
						rl.close();
						return;
					}
				} else {
					await handleChatInput(input, state, args.name, config);
				}
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				logger.error(`Error: ${message}`);
			}

			logger.log("");
			rl.prompt();
		});

		rl.on("close", () => {
			logger.log("Goodbye!");
			process.exit(0);
		});

		// Keep the process alive
		await new Promise(() => {
			// This promise never resolves -- the REPL runs until /quit or Ctrl+C
		});
	},
});
