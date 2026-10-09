const { spawn } = require("node:child_process");
const { createWriteStream, mkdirSync } = require("node:fs");
const path = require("node:path");
const { constants } = require("node:os");

const [logPath, ...args] = process.argv.slice(2);
const pnpmCli = process.env.npm_execpath;
if (!logPath || !pnpmCli || args.length === 0) {
	throw new Error(
		"Usage: pnpm run test:ci:logged <log-path> <pnpm-arguments...>"
	);
}
mkdirSync(path.dirname(logPath), { recursive: true });
const log = createWriteStream(logPath);
const child = spawn(process.execPath, [pnpmCli, ...args], {
	stdio: ["inherit", "pipe", "pipe"],
});
child.stdout.on("data", (chunk) => {
	log.write(chunk);
	process.stdout.write(chunk);
});
child.stderr.on("data", (chunk) => {
	log.write(chunk);
	process.stderr.write(chunk);
});

let finished = false;
let drain;
/** Flush captured output and release pipes held open by orphaned descendants. */
function finish(code) {
	if (finished) return;
	finished = true;
	clearTimeout(drain);
	child.stdout.destroy();
	child.stderr.destroy();
	log.end();
	process.exitCode = code;
}
child.on("error", (error) => {
	console.error(error);
	finish(1);
});
child.on("exit", (code, signal) => {
	const exitCode = code ?? 128 + (constants.signals[signal] ?? 1);
	// Normally close follows exit after all buffered output drains. On Windows,
	// failed tests can leave a descendant holding these pipes open indefinitely.
	drain = setTimeout(() => finish(exitCode), 250);
});
child.on("close", (code, signal) => {
	finish(code ?? 128 + (constants.signals[signal] ?? 1));
});
log.on("error", (error) => {
	console.error(error);
	child.kill();
	finish(1);
});
for (const signal of ["SIGINT", "SIGTERM"]) {
	process.on(signal, () => child.kill(signal));
}
