import assert from "node:assert";
import childProcess, { execSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import rl from "node:readline";
import stream from "node:stream";
import { setTimeout } from "node:timers/promises";
import { stripVTControlCharacters } from "node:util";
import { fetch } from "undici";
import {
	afterAll,
	afterEach,
	describe as baseDescribe,
	beforeAll,
	expect,
	it,
	vi,
} from "vitest";
import { wranglerEntryPath } from "../../shared/src/run-wrangler-long-lived";
import type pty from "@cdktf/node-pty-prebuilt-multiarch";

// These tests are failing with `Error: read EPIPE` on Windows in CI. There's still value running them on macOS and Linux.
if (process.platform === "win32") {
	baseDescribe("interactive dev session tests", () => {
		it.skip("skipped on Windows", () => {});
	});
} else {
	// Windows doesn't have a built-in way to get the CWD of a process by its ID.
	// This functionality is provided by the Windows Driver Kit which is installed
	// on GitHub actions Windows runners.
	const tlistPath =
		"C:\\Program Files (x86)\\Windows Kits\\10\\Debuggers\\x86\\tlist.exe";
	let windowsProcessCwdSupported = true;
	if (!fs.existsSync(tlistPath)) {
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
	const describe = baseDescribe.runIf(nodePtySupported);

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
		const exitPromise = new Promise<number>(
			(resolve) => (exitResolve = resolve)
		);

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
				if (
					(readyMatch = readyRegexp.exec(stripVTControlCharacters(line))) !==
					null
				)
					break;
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
			({ cmd, pid }) =>
				cmd.includes("workerd") && getProcessCwd(pid) === pkgRoot
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

	const isCINonLinux =
		process.platform !== "linux" && process.env.CI === "true";

	function isDockerRunning() {
		try {
			execSync("docker ps", { stdio: "ignore" });
			return true;
		} catch (e) {
			return false;
		}
	}

	/** Indicates whether the test is being run locally (not in CI) AND docker is currently not running on the system */
	const isLocalWithoutDockerRunning =
		process.env.CI !== "true" && !isDockerRunning();

	if (isLocalWithoutDockerRunning) {
		console.warn(
			"The tests are running locally but there is no docker instance running on the system, skipping containers tests"
		);
	}

	baseDescribe.skipIf(
		isCINonLinux ||
			// If the tests are being run locally and docker is not running we just skip this test
			isLocalWithoutDockerRunning
	)("containers", () => {
		// it seems like if we spam the container too often, it freezes up and crashes
		const WAITFOR_OPTIONS = { timeout: 2000, interval: 500 };
		baseDescribe("container dev", { retry: 0, timeout: 90000 }, () => {
			let tmpDir: string;
			beforeAll(async () => {
				tmpDir = fs.mkdtempSync(path.join(tmpdir(), "wrangler-container-"));
				fs.cpSync(
					path.resolve(__dirname, "../", "container-app"),
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
			});

			afterEach(async () => {
				const ids = getContainerIds();
				if (ids.length > 0) {
					execSync("docker rm -f " + ids.join(" "), {
						encoding: "utf8",
					});
				}
			});
			afterAll(async () => {
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

			it("should print rebuild containers hotkey", async () => {
				const wrangler = await startWranglerDev([
					"dev",
					"-c",
					path.join(tmpDir, "wrangler.jsonc"),
				]);
				wrangler.pty.kill();
				expect(wrangler.stdout).toContain("rebuild container");
			});

			it("should rebuild a container when the hotkey is pressed", async () => {
				const wrangler = await startWranglerDev([
					"dev",
					"-c",
					path.join(tmpDir, "wrangler.jsonc"),
				]);
				await fetch(wrangler.url + "/start");

				// wait container to be ready
				await vi.waitFor(async () => {
					const status = await fetch(wrangler.url + "/status");
					expect(await status.json()).toBe(true);
				}, WAITFOR_OPTIONS);

				await vi.waitFor(async () => {
					const res = await fetch(wrangler.url + "/fetch", {
						// Sometimes this fetch can hang if the container is not ready
						// The default timeout is longer than the timeout on the `waitFor()` which results in the test failing.
						// So abort this request sooner to allow it to retry.
						signal: AbortSignal.timeout(500),
					});

					expect(await res.text()).toBe(
						"Hello World! Have an env var! I'm an env var!"
					);
				}, WAITFOR_OPTIONS);
				const output = wrangler.stdout;
				// Extract the Docker image name from the output
				const imageNameMatch = output.match(
					/cloudflare-dev\/fixturetestcontainer:[a-f0-9]+/
				);
				expect(imageNameMatch).not.toBe(null);
				const imageName = imageNameMatch![0];
				expect(
					JSON.parse(
						execSync(
							`docker image inspect ${imageName} --format "{{ json .RepoTags }}"`,
							{ encoding: "utf8" }
						)
					).length
				).toBeGreaterThanOrEqual(1);

				fs.writeFileSync(
					path.join(tmpDir, "container", "simple-node-app.js"),
					`const { createServer } = require("http");

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

				await vi.waitFor(async () => {
					const status = await fetch(wrangler.url + "/status");
					expect(await status.json()).toBe(false);
				}, WAITFOR_OPTIONS);

				await fetch(wrangler.url + "/start");
				await vi.waitFor(async () => {
					const status = await fetch(wrangler.url + "/status");
					expect(await status.json()).toBe(true);
				}, WAITFOR_OPTIONS);
				await vi.waitFor(async () => {
					const res = await fetch(wrangler.url + "/fetch", {
						signal: AbortSignal.timeout(500),
					});
					expect(await res.text()).toBe("Blah! I'm an env var!");
				}, WAITFOR_OPTIONS);

				// Verify that the old image tag has been deleted after rebuild
				expect(() => {
					execSync(`docker image inspect ${imageName}`, { encoding: "utf8" });
				}).toThrow();

				wrangler.pty.kill();
			});

			it("should clean up any containers that were started", async () => {
				const wrangler = await startWranglerDev([
					"dev",
					"-c",
					path.join(tmpDir, "wrangler.jsonc"),
				]);
				await fetch(wrangler.url + "/start");

				// wait container to be ready
				await vi.waitFor(async () => {
					const ids = getContainerIds();
					expect(ids.length).toBe(1);
				}, WAITFOR_OPTIONS);

				// ctrl + c
				wrangler.pty.write("\x03");
				await new Promise<void>((resolve) => {
					wrangler.pty.onExit(() => resolve());
				});

				await vi.waitFor(() => {
					const remainingIds = getContainerIds();
					expect(remainingIds.length).toBe(0);
				});
			});
		});

		baseDescribe(
			"container dev where image build takes a long time",
			{ retry: 0, timeout: 90000 },
			() => {
				let tmpDir: string;
				beforeAll(async () => {
					tmpDir = fs.mkdtempSync(
						path.join(tmpdir(), "wrangler-container-sleep-")
					);
					fs.cpSync(
						path.resolve(__dirname, "../", "container-app"),
						path.join(tmpDir),
						{
							recursive: true,
						}
					);
					const tmpDockerFilePath = path.join(tmpDir, "Dockerfile");
					fs.rmSync(tmpDockerFilePath);
					fs.renameSync(
						path.join(tmpDir, "DockerfileWithLongSleep"),
						tmpDockerFilePath
					);

					const ids = getContainerIds();
					if (ids.length > 0) {
						execSync("docker rm -f " + ids.join(" "), {
							encoding: "utf8",
						});
					}
				});

				afterEach(async () => {
					const ids = getContainerIds();
					if (ids.length > 0) {
						execSync("docker rm -f " + ids.join(" "), {
							encoding: "utf8",
						});
					}
				});

				afterAll(async () => {
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

				it("should allow quitting while the image is building", async () => {
					const wrangler = await startWranglerDev(
						["dev", "-c", path.join(tmpDir, "wrangler.jsonc")],
						true
					);

					const waitForOptions = {
						timeout: 10_000,
						interval: WAITFOR_OPTIONS.interval,
					};

					// wait for long sleep instruction to start
					await vi.waitFor(async () => {
						expect(wrangler.stdout).toContain("RUN sleep 50000");
					}, waitForOptions);

					wrangler.pty.write("q");

					await vi.waitFor(async () => {
						expect(wrangler.stdout).toMatch(/CANCELED \[.*?\] RUN sleep 50000/);
					}, waitForOptions);
				});

				it("should rebuilding while the image is building", async () => {
					const wrangler = await startWranglerDev(
						["dev", "-c", path.join(tmpDir, "wrangler.jsonc")],
						true
					);

					const waitForOptions = {
						timeout: 15_000,
						interval: 1_500,
					};

					// wait for long sleep instruction to start
					await vi.waitFor(async () => {
						expect(wrangler.stdout).toContain("RUN sleep 50000");
					}, waitForOptions);

					let logOccurrencesBefore =
						wrangler.stdout.match(/This \(no-op\) build takes forever.../g)
							?.length ?? 0;

					wrangler.pty.write("r");

					await vi.waitFor(async () => {
						const logOccurrences =
							wrangler.stdout.match(/This \(no-op\) build takes forever.../g)
								?.length ?? 0;
						expect(logOccurrences).toBeGreaterThan(1);
						logOccurrencesBefore = logOccurrences;
					}, waitForOptions);

					await vi.waitFor(async () => {
						await setTimeout(700);
						wrangler.pty.write("r");
						const logOccurrences =
							wrangler.stdout.match(/This \(no-op\) build takes forever.../g)
								?.length ?? 0;
						expect(logOccurrences).toBeGreaterThan(logOccurrencesBefore);
					}, waitForOptions);

					wrangler.pty.kill();
				});
			}
		);

		baseDescribe("multi-containers dev", { retry: 0, timeout: 50000 }, () => {
			let tmpDir: string;
			beforeAll(async () => {
				tmpDir = fs.mkdtempSync(
					path.join(tmpdir(), "wrangler-multi-containers-")
				);
				fs.cpSync(
					path.resolve(__dirname, "../", "multi-containers-app"),
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
			});

			afterEach(async () => {
				const ids = getContainerIds();
				if (ids.length > 0) {
					execSync("docker rm -f " + ids.join(" "), {
						encoding: "utf8",
					});
				}
			});
			afterAll(async () => {
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

			it("should print build logs for all the containers", async () => {
				const wrangler = await startWranglerDev([
					"dev",
					"-c",
					path.join(tmpDir, "wrangler.jsonc"),
				]);
				await vi.waitFor(
					() => {
						expect(wrangler.stdout).toContain('"name": "simple-node-app-a"');
						expect(wrangler.stdout).toContain('"name": "simple-node-app-b"');
					},
					{ timeout: 10_000 }
				);
				wrangler.pty.kill();
			});

			it("should rebuild all the containers when the hotkey is pressed", async () => {
				const wrangler = await startWranglerDev([
					"dev",
					"-c",
					path.join(tmpDir, "wrangler.jsonc"),
				]);

				await vi.waitFor(
					async () => {
						const text = await (
							await fetch(wrangler.url, { signal: AbortSignal.timeout(3_000) })
						).text();
						expect(text).toBe(
							'Response from A: "Hello from Container A" Response from B: "Hello from Container B"'
						);
					},
					{ timeout: 30_000, interval: 1000 }
				);

				const tmpDockerfileAPath = path.join(tmpDir, "DockerfileA");
				const dockerFileAContent = fs.readFileSync(tmpDockerfileAPath, "utf8");
				fs.writeFileSync(
					tmpDockerfileAPath,
					dockerFileAContent.replace(
						'"Hello from Container A"',
						'"Hello World from Container A"'
					),
					"utf-8"
				);

				const tmpDockerfileBPath = path.join(tmpDir, "DockerfileB");
				const dockerFileBContent = fs.readFileSync(tmpDockerfileBPath, "utf8");
				fs.writeFileSync(
					tmpDockerfileBPath,
					dockerFileBContent.replace(
						'"Hello from Container B"',
						'"Hello from the B Container"'
					),
					"utf-8"
				);

				wrangler.pty.write("r");

				await vi.waitFor(
					async () => {
						const text = await (
							await fetch(wrangler.url, { signal: AbortSignal.timeout(3_000) })
						).text();
						expect(text).toBe(
							'Response from A: "Hello World from Container A" Response from B: "Hello from the B Container"'
						);
					},
					{ timeout: 30_000, interval: 1000 }
				);

				fs.writeFileSync(tmpDockerfileAPath, dockerFileAContent, "utf-8");
				fs.writeFileSync(tmpDockerfileBPath, dockerFileBContent, "utf-8");

				wrangler.pty.kill();
			});

			it("should clean up any containers that were started", async () => {
				const wrangler = await startWranglerDev([
					"dev",
					"-c",
					path.join(tmpDir, "wrangler.jsonc"),
				]);
				// wait container to be ready
				await vi.waitFor(
					async () => {
						const text = await (
							await fetch(wrangler.url, { signal: AbortSignal.timeout(3_000) })
						).text();
						expect(text).toBe(
							'Response from A: "Hello from Container A" Response from B: "Hello from Container B"'
						);
					},
					{ timeout: 30_000, interval: 1000 }
				);
				const ids = getContainerIds();
				expect(ids.length).toBe(2);

				// ctrl + c
				wrangler.pty.write("\x03");
				await new Promise<void>((resolve) => {
					wrangler.pty.onExit(() => resolve());
				});
				await vi.waitFor(() => {
					const remainingIds = getContainerIds();
					expect(remainingIds.length).toBe(0);
				});
			});
		});

		baseDescribe(
			"multi-workers containers dev",
			{ retry: 0, timeout: 50000 },
			() => {
				let tmpDir: string;
				beforeAll(async () => {
					tmpDir = fs.mkdtempSync(
						path.join(tmpdir(), "wrangler-multi-workers-containers-")
					);
					fs.cpSync(
						path.resolve(__dirname, "../", "multi-workers-containers-app"),
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
				});

				afterEach(async () => {
					const ids = getContainerIds();

					if (ids.length > 0) {
						execSync("docker rm -f " + ids.join(" "), {
							encoding: "utf8",
						});
					}
				});
				afterAll(async () => {
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

				it("should be able to interact with both workers, rebuild the containers with the hotkey and all containers should be cleaned up at the end", async () => {
					const wrangler = await startWranglerDev([
						"dev",
						"-c",
						path.join(tmpDir, "workerA/wrangler.jsonc"),
						"-c",
						path.join(tmpDir, "workerB/wrangler.jsonc"),
					]);

					await vi.waitFor(
						async () => {
							const json = await (
								await fetch(wrangler.url, {
									signal: AbortSignal.timeout(5_000),
								})
							).json();
							expect(json).toEqual({
								containerAText: "Hello from Container A",
								containerBText: "Hello from Container B",
							});
						},
						{ timeout: 10_000, interval: 1000 }
					);

					const tmpDockerfileAPath = path.join(tmpDir, "workerA/Dockerfile");
					const dockerFileAContent = fs.readFileSync(
						tmpDockerfileAPath,
						"utf8"
					);
					fs.writeFileSync(
						tmpDockerfileAPath,
						dockerFileAContent.replace(
							'"Hello from Container A"',
							'"Hello World from Container A"'
						),
						"utf-8"
					);

					const tmpDockerfileBPath = path.join(tmpDir, "workerB/Dockerfile");
					const dockerFileBContent = fs.readFileSync(
						tmpDockerfileBPath,
						"utf8"
					);
					fs.writeFileSync(
						tmpDockerfileBPath,
						dockerFileBContent.replace(
							'"Hello from Container B"',
							'"Hello from the B Container"'
						),
						"utf-8"
					);

					wrangler.pty.write("r");

					await vi.waitFor(
						async () => {
							const json = await (
								await fetch(wrangler.url, {
									signal: AbortSignal.timeout(5_000),
								})
							).json();
							expect(json).toEqual({
								containerAText: "Hello World from Container A",
								containerBText: "Hello from the B Container",
							});
						},
						{ timeout: 30_000, interval: 1000 }
					);

					fs.writeFileSync(tmpDockerfileAPath, dockerFileAContent, "utf-8");
					fs.writeFileSync(tmpDockerfileBPath, dockerFileBContent, "utf-8");

					wrangler.pty.kill("SIGINT");
				});
			}
		);

		/** gets any containers that were created by running this fixture */
		const getContainerIds = () => {
			// note the -a to include stopped containers
			const allContainers = execSync(`docker ps -a --format json`)
				.toString()
				.split("\n")
				.filter((line) => line.trim());
			if (allContainers.length === 0) {
				return [];
			}
			const jsonOutput = allContainers.map((line) => JSON.parse(line));

			const matches = jsonOutput.map((container) => {
				if (container.Image.includes("cloudflare-dev/fixturetestcontainer")) {
					return container.ID;
				}
			});
			return matches.filter(Boolean);
		};
	});
}
