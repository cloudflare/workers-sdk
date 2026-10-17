import { spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { onTestFinished, vi } from "vitest";

const require = createRequire(import.meta.url);

// Pipes let the tests drive real prompts without adding a native PTY dependency.
const terminalSetup = `
Object.defineProperty(process.stdin, "isTTY", { value: true });
Object.defineProperty(process.stdout, "isTTY", { value: true });
Object.defineProperty(process.stderr, "isTTY", { value: true });
process.stdin.setRawMode = () => process.stdin;
`;

/** Starts the installed Wrangler CLI with deterministic interactive input. */
export function startPublishedWrangler(
	args: string[],
	cwd: string,
	env: NodeJS.ProcessEnv = {}
) {
	const child = spawn(
		process.execPath,
		[
			"--import",
			`data:text/javascript,${encodeURIComponent(terminalSetup)}`,
			require.resolve("wrangler"),
			...args,
		],
		{
			cwd,
			env: {
				...process.env,
				CI: "false",
				CF_PAGES: "",
				WORKERS_CI: "",
				WRANGLER_SEND_METRICS: "false",
				WRANGLER_HOME: cwd,
				WRANGLER_LOG_PATH: cwd,
				...env,
			},
		}
	);
	let output = "";
	child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
		output += chunk;
	});
	child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
		output += chunk;
	});
	const closed = once(child, "close");
	onTestFinished(async () => {
		if (child.exitCode === null && child.signalCode === null) {
			child.kill();
		}
		await closed;
	});

	return {
		child,
		closed,
		get output() {
			return output;
		},
		async waitForOutput(text: string) {
			await vi.waitFor(
				() => {
					if (!output.includes(text)) {
						throw new Error(`Waiting for ${JSON.stringify(text)}:\n${output}`);
					}
				},
				{ timeout: 20_000, interval: 20 }
			);
		},
	};
}
