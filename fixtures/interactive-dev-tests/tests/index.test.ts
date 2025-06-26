import assert from "node:assert";
import childProcess, { execSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import rl from "node:readline";
import stream from "node:stream";
import stripAnsi from "strip-ansi";
import { fetch } from "undici";
import {
	afterAll,
	afterEach,
	describe as baseDescribe,
	beforeAll,
	expect,
	it,
} from "vitest";
import { wranglerEntryPath } from "../../shared/src/run-wrangler-long-lived";
import type pty from "@cdktf/node-pty-prebuilt-multiarch";

// These tests are failing with `Error: read EPIPE` on Windows in CI. There's
// still value running them on macOS and Linux.
const RUN_IF = process.platform !== "win32";

// Windows doesn't have a built-in way to get the CWD of a process by its ID.
// This functionality is provided by the Windows Driver Kit which is installed
// on GitHub actions Windows runners.
const tlistPath =
	"C:\\Program Files (x86)\\Windows Kits\\10\\Debuggers\\x86\\tlist.exe";
let windowsProcessCwdSupported = true;
if (process.platform === "win32" && !fs.existsSync(tlistPath)) {
	windowsProcessCwdSupported = false;
	const message = [
		"=".repeat(80),
		"Unable to find Windows Driver Kit, skipping zombie process tests... :(",
		"=".repeat(80),
	].join("\n");
	console.error(message);
}

const pkgRoot = path.resolve(__dirname, "..");
const ptyOptions: pty.IPtyForkOptions = {
	name: "xterm-color",
	cols: 80,
	rows: 30,
	cwd: pkgRoot,
	env: process.env as Record<string, string>,
};

// Check `node-pty` installed and working correctly, skipping tests if not
let nodePtySupported = true;
try {
	const pty = await import("@cdktf/node-pty-prebuilt-multiarch");
	const ptyProcess = pty.spawn(
		process.execPath,
		["-p", "'ran node'"],
		ptyOptions
	);
	let output = "";
	ptyProcess.onData((data) => (output += data));
	const code = await new Promise<number>((resolve) =>
		ptyProcess.onExit(({ exitCode }) => resolve(exitCode))
	);
	assert.strictEqual(code, 0);
	assert(output.includes("ran node"));
} catch (e) {
	nodePtySupported = false;
	const message = [
		"=".repeat(80),
		"`node-pty` unsupported, skipping interactive dev session tests... :(",
		"",
		"Ensure its dependencies (https://github.com/microsoft/node-pty#dependencies)",
		"are installed, then re-run `pnpm install` in the repository root.",
		"",
		"On Windows, make sure you have `Desktop development with C++`, `Windows SDK`,",
		"`MSVC VS C++ build tools`, and `MSVC VS C++ Spectre-mitigated libs` Visual",
		"Studio components installed.",
		"",
		e instanceof Error ? e.stack : String(e),
		"=".repeat(80),
	].join("\n");
	console.error(message);
}
const describe = baseDescribe.runIf(RUN_IF && nodePtySupported);

interface PtyProcess {
	pty: pty.IPty;
	stdout: string;
	exitCode: number | null;
	exitPromise: Promise<number>;
	url: string;
}
const processes: PtyProcess[] = [];
afterEach(() => {
	for (const p of processes.splice(0)) {
		// If the process didn't exit cleanly, log its output for debugging
		if (p.exitCode !== 0) console.log(p.stdout);
		// If the process hasn't exited yet, kill it
		if (p.exitCode === null) {
			// `node-pty` throws if signal passed on Windows
			if (process.platform === "win32") p.pty.kill();
			else p.pty.kill("SIGKILL");
		}
	}
});

const readyRegexp = /Ready on (http:\/\/[a-z0-9.]+:[0-9]+)/;
async function startWranglerDev(args: string[], skipWaitingForReady = false) {
	const stdoutStream = new stream.PassThrough();
	const stdoutInterface = rl.createInterface(stdoutStream);

	let exitResolve: ((code: number) => void) | undefined;
	const exitPromise = new Promise<number>((resolve) => (exitResolve = resolve));

	const pty = await import("@cdktf/node-pty-prebuilt-multiarch");
	const ptyProcess = pty.spawn(
		process.execPath,
		[
			wranglerEntryPath,
			...args,
			"--ip=127.0.0.1",
			"--port=0",
			"--inspector-port=0",
		],
		ptyOptions
	);
	const result: PtyProcess = {
		pty: ptyProcess,
		stdout: "",
		exitCode: null,
		exitPromise,
		url: "",
	};
	processes.push(result);
	ptyProcess.onData((data) => {
		result.stdout += data;
		stdoutStream.write(data);
	});
	ptyProcess.onExit(({ exitCode }) => {
		result.exitCode = exitCode;
		exitResolve?.(exitCode);
		stdoutStream.end();
	});

	if (!skipWaitingForReady) {
		let readyMatch: RegExpMatchArray | null = null;
		for await (const line of stdoutInterface) {
			if ((readyMatch = readyRegexp.exec(stripAnsi(line))) !== null) break;
		}
		assert(readyMatch !== null, "Expected ready message");
		result.url = readyMatch[1];
	}
	return result;
}

interface Process {
	pid: string;
	cmd: string;
}
function getProcesses(): Process[] {
	if (process.platform === "win32") {
		return childProcess
			.execSync("tasklist /fo csv", { encoding: "utf8" })
			.trim()
			.split("\r\n")
			.slice(1)
			.map((line) => {
				const [cmd, pid] = line.replaceAll('"', "").split(",");
				return { pid, cmd };
			});
	} else {
		return childProcess
			.execSync("ps -e | awk '{print $1,$4}'", { encoding: "utf8" })
			.trim()
			.split("\n")
			.map((line) => {
				const [pid, cmd] = line.split(" ");
				return { pid, cmd };
			});
	}
}
function getProcessCwd(pid: string | number) {
	if (process.platform === "win32") {
		if (windowsProcessCwdSupported) {
			return (
				childProcess
					.spawnSync(tlistPath, [String(pid)], { encoding: "utf8" })
					.stdout.match(/^\s*CWD:\s*(.+)\\$/m)?.[1] ?? ""
			);
		} else {
			return "";
		}
	} else {
		return childProcess
			.execSync(`lsof -p ${pid} | awk '$4=="cwd" {print $9}'`, {
				encoding: "utf8",
			})
			.trim();
	}
}
function getStartedWorkerdProcesses(): Process[] {
	return getProcesses().filter(
		({ cmd, pid }) => cmd.includes("workerd") && getProcessCwd(pid) === pkgRoot
	);
}

const devScripts = [
	{ args: ["dev"], expectedBody: "body" },
	{ args: ["pages", "dev", "public"], expectedBody: "<p>body</p>" },
];
const exitKeys = [
	{ name: "CTRL-C", key: "\x03" },
	{ name: "x", key: "x" },
];

describe.each(devScripts)("wrangler $args", ({ args, expectedBody }) => {
	it.each(exitKeys)("cleanly exits with $name", async ({ key }) => {
		const beginProcesses = getStartedWorkerdProcesses();

		const wrangler = await startWranglerDev(args);
		const duringProcesses = getStartedWorkerdProcesses();

		// Check dev server working correctly
		const res = await fetch(wrangler.url);
		expect((await res.text()).trim()).toBe(expectedBody);

		// Check key cleanly exits dev server
		wrangler.pty.write(key);
		expect(await wrangler.exitPromise).toBe(0);
		const endProcesses = getStartedWorkerdProcesses();

		// Check no hanging workerd processes
		if (process.platform !== "win32" || windowsProcessCwdSupported) {
			expect(beginProcesses.length).toBe(endProcesses.length);
			expect(duringProcesses.length).toBeGreaterThan(beginProcesses.length);
		}
	});
	describe("--show-interactive-dev-session", () => {
		it("should show hotkeys when interactive", async () => {
			const wrangler = await startWranglerDev(args);
			wrangler.pty.kill();
			expect(wrangler.stdout).toContain("open a browser");
			expect(wrangler.stdout).toContain("open devtools");
			expect(wrangler.stdout).toContain("clear console");
			expect(wrangler.stdout).toContain("to exit");
			expect(wrangler.stdout).not.toContain("rebuild container");
		});
		it("should not show hotkeys with --show-interactive-dev-session=false", async () => {
			const wrangler = await startWranglerDev([
				...args,
				"--show-interactive-dev-session=false",
			]);
			wrangler.pty.kill();
			expect(wrangler.stdout).not.toContain("open a browser");
			expect(wrangler.stdout).not.toContain("open devtools");
			expect(wrangler.stdout).not.toContain("clear console");
			expect(wrangler.stdout).not.toContain("to exit");
			expect(wrangler.stdout).not.toContain("rebuild container");
		});
	});
});

it.each(exitKeys)("multiworker cleanly exits with $name", async ({ key }) => {
	const beginProcesses = getStartedWorkerdProcesses();

	const wrangler = await startWranglerDev([
		"dev",
		"-c",
		"wrangler.a.jsonc",
		"-c",
		"wrangler.b.jsonc",
	]);
	const duringProcesses = getStartedWorkerdProcesses();

	// Check dev server working correctly
	const res = await fetch(wrangler.url);
	expect((await res.text()).trim()).toBe("hello from a & hello from b");

	// Check key cleanly exits dev server
	wrangler.pty.write(key);
	expect(await wrangler.exitPromise).toBe(0);
	const endProcesses = getStartedWorkerdProcesses();

	// Check no hanging workerd processes
	if (process.platform !== "win32" || windowsProcessCwdSupported) {
		expect(beginProcesses.length).toBe(endProcesses.length);
		expect(duringProcesses.length).toBeGreaterThan(beginProcesses.length);
	}
});

baseDescribe.skipIf(process.platform !== "linux" && process.env.CI === "true")(
	"container dev",
	{ retry: 1, timeout: 90000 },
	() => {
		let tmpDir: string;
		let wrangler: PtyProcess;
		beforeAll(async () => {
			tmpDir = fs.mkdtempSync(path.join(tmpdir(), "wrangler-container-"));
			fs.cpSync(
				path.resolve(__dirname, "..", "container-app"),
				path.join(tmpDir),
				{
					recursive: true,
				}
			);
			const ids = getContainerIds();
			if (ids.length > 0) {
				execSync("docker rm -f " + ids.join(" "), {
					encoding: "utf8",
				});
			}
			wrangler = await startWranglerDev(["dev", "--cwd", "./container-app"]);
		});
		afterAll(async () => {
			const ids = getContainerIds();
			if (ids.length > 0) {
				execSync("docker rm -f " + ids.join(" "), {
					encoding: "utf8",
				});
			}

			try {
				fs.rmSync(tmpDir, { recursive: true, force: true });
			} catch (e) {
				// It seems that Windows doesn't let us delete this, with errors like:
				//
				// Error: EBUSY: resource busy or locked, rmdir 'C:\Users\RUNNER~1\AppData\Local\Temp\wrangler-modules-pKJ7OQ'
				// ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
				// Serialized Error: {
				// 	"code": "EBUSY",
				// 	"errno": -4082,
				// 	"path": "C:\Users\RUNNER~1\AppData\Local\Temp\wrangler-modules-pKJ7OQ",
				// 	"syscall": "rmdir",
				// }
				console.error(e);
			}
		});

		it("should rebuild a container when the hotkey is pressed", async () => {
			console.log("initial url", wrangler.url);
			await fetch(wrangler.url + "/start");

			await new Promise((resolve) => setTimeout(resolve, 1500));

			let status = await fetch(wrangler.url + "/status");
			expect(await status.json()).toBe(true);
			let res = await fetch(wrangler.url + "/fetch");
			expect(await res.text()).toBe("Hello World! FOO");

			fs.writeFileSync(
				path.join(tmpDir, "container-src", "simple-node-app.js"),
				`const { createServer } = require("http");

			// Create HTTP server
			const server = createServer(function (req, res) {
				res.writeHead(200, { "Content-Type": "text/plain" });
				res.write("Blah! " + process.env.MESSAGE);
				res.end();
			});

			server.listen(8080, function () {
				console.log("Server listening on port 8080");
			});`,
				"utf-8"
			);

			wrangler.pty.write("r");

			await new Promise((resolve) => setTimeout(resolve, 5000));

			status = await fetch(wrangler.url + "/status");
			expect(await status.json()).toBe(false);

			await fetch(wrangler.url + "/start");
			await new Promise((resolve) => setTimeout(resolve, 2000));
			// 			await new Promise((resolve) => setTimeout(resolve, 1500));
			status = await fetch(wrangler.url + "/status");
			expect(await status.json()).toBe(true);
			res = await fetch(wrangler.url + "/fetch");
			expect(await res.text()).toBe("Blah! FOO");
		});

		// // docker isn't installed by default on windows/macos runners
		// it("should print rebuild containers hotkey", async () => {
		// 	wrangler.pty.kill();
		// 	expect(wrangler.stdout).toContain("rebuild container");
		// });
	}
);
// todo cleanup containers after

const getContainerIds = () => {
	// note the -a to include stopped containers
	const ids = execSync("docker ps -a -q");
	return ids
		.toString()
		.trim()
		.split("\n")
		.filter((id) => id.trim() !== "");
};
