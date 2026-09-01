#!/usr/bin/env node
const { spawn } = require("node:child_process");

let cfProcess;

/**
 * Executes `npx cf` with the arguments passed to Wrangler.
 */
function runCf() {
	return spawn("npx", ["cf", ...process.argv.slice(2)], {
		stdio: "inherit",
	})
		.on("error", (error) => {
			process.stderr.write(`Failed to run npx cf: ${error.message}\n`);
			process.exitCode = 1;
		})
		.on("exit", (code) => process.exit(code ?? 0));
}

if (module === require.main) {
	cfProcess = runCf();
	process.on("SIGINT", () => cfProcess.kill("SIGINT"));
	process.on("SIGTERM", () => cfProcess.kill("SIGTERM"));
}
