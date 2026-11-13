import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";

const wranglerBin = path.resolve(
	import.meta.dirname,
	"../../../bin/wrangler.js"
);

async function runWranglerWithSignal(
	signal: "SIGINT" | "SIGTERM"
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
	mkdirSync("bin");
	copyFileSync(wranglerBin, "bin/wrangler.js");
	writeFileSync(
		"mock-child-process.cjs",
		`const { EventEmitter } = require("node:events");
const childProcess = require("node:child_process");

childProcess.spawn = () => {
	const child = new EventEmitter();
	child.kill = (signal) => {
		process.nextTick(() => child.emit("exit", null, signal));
	};
	return child;
};

const originalProcessOn = process.on;
process.on = function (eventName, listener) {
	const result = originalProcessOn.call(this, eventName, listener);
	if (eventName === "${signal}") {
		setImmediate(listener);
	}
	return result;
};
`
	);

	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [
			"--require",
			path.resolve("mock-child-process.cjs"),
			path.resolve("bin/wrangler.js"),
		]);
		child.on("error", reject);
		child.on("exit", (code, childSignal) =>
			resolve({ code, signal: childSignal })
		);
	});
}

/**
 * Runs `bin/wrangler.js deploy --dry-run --secrets-file <secretsFile>` from Bash,
 * as on macOS, with a stand-in CLI that prints the secrets file it was given.
 *
 * On macOS, Node spawns child processes with `POSIX_SPAWN_CLOEXEC_DEFAULT`, so a
 * child receives only the file descriptors listed in its `stdio` option. Linux
 * passes on every inheritable descriptor, so the preload closes the others before
 * running each spawned command, and reports the platform as `darwin`.
 */
async function runWranglerAsOnMacOS(
	secretsFile: string
): Promise<{ code: number | null; stdout: string; stderr: string }> {
	mkdirSync("bin");
	copyFileSync(wranglerBin, "bin/wrangler.js");
	mkdirSync("wrangler-dist");
	writeFileSync(
		"wrangler-dist/cli.js",
		`const fs = require("node:fs");
const args = process.argv.slice(2);
const secretsFile = args[args.indexOf("--secrets-file") + 1];
try {
	process.stdout.write(fs.readFileSync(secretsFile, "utf8"));
} catch (e) {
	process.stderr.write(\`Could not read file: \${secretsFile}\\n\${e.message}\\n\`);
	process.exitCode = 1;
}
`
	);
	writeFileSync(
		"mock-macos-spawn.cjs",
		`const childProcess = require("node:child_process");
const spawn = childProcess.spawn;

Object.defineProperty(process, "platform", { value: "darwin" });

const closeUnlistedDescriptors =
	'for fd in $(ls /proc/$$/fd); do if [ "$fd" -ge "$0" ]; then eval "exec $fd<&-"; fi; done; exec "$@"';

childProcess.spawn = (command, args, options) => {
	if (!Array.isArray(args)) {
		options = args;
		args = [];
	}
	const stdio = options && options.stdio;
	const listed = Array.isArray(stdio) ? stdio.length : 3;
	return spawn(
		"bash",
		["-c", closeUnlistedDescriptors, String(listed), command, ...args],
		options
	);
};
`
	);
	return new Promise((resolve, reject) => {
		const child = spawn(
			"bash",
			[
				"-c",
				`"$0" --require "$1" "$2" deploy --dry-run --secrets-file ${secretsFile}`,
				process.execPath,
				path.resolve("mock-macos-spawn.cjs"),
				path.resolve("bin/wrangler.js"),
			],
			{ stdio: ["ignore", "pipe", "pipe"] }
		);
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => (stdout += chunk));
		child.stderr.on("data", (chunk) => (stderr += chunk));
		child.on("error", reject);
		child.on("close", (code) => resolve({ code, stdout, stderr }));
	});
}

describe("Wrangler executable", () => {
	runInTempDir();

	describe.skipIf(process.platform === "win32")(
		"--secrets-file on macOS",
		() => {
			it("reads a regular file", async ({ expect }) => {
				writeFileSync("secrets.env", "DUMMY_SECRET=value\n");

				const result = await runWranglerAsOnMacOS("secrets.env");

				expect(result).toEqual({
					code: 0,
					stdout: "DUMMY_SECRET=value\n",
					stderr: "",
				});
			});

			// https://github.com/cloudflare/workers-sdk/issues/16425
			it("reads a /dev/fd path from Bash process substitution", async ({
				expect,
			}) => {
				const result = await runWranglerAsOnMacOS(
					`<(printf "DUMMY_SECRET=value\\n")`
				);

				expect(result).toEqual({
					code: 0,
					stdout: "DUMMY_SECRET=value\n",
					stderr: "",
				});
			});
		}
	);

	it("forwards SIGINT and exits with its shell status", async ({ expect }) => {
		const result = await runWranglerWithSignal("SIGINT");

		expect(result).toEqual({ code: 130, signal: null });
	});

	it("forwards SIGTERM and exits with its shell status", async ({ expect }) => {
		const result = await runWranglerWithSignal("SIGTERM");

		expect(result).toEqual({ code: 143, signal: null });
	});
});
