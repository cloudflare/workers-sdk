import childProcess from "node:child_process";
import { writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import util from "node:util";
import { removeDir } from "@cloudflare/workers-utils";
import { stripAnsi } from "miniflare";
import treeKill from "tree-kill";
import dedent from "ts-dedent";
import { test as baseTest, inject, vi } from "vitest";
import type { WorkerPoolOptionsContext } from "../src/pool/plugin";

const debuglog = util.debuglog("vitest-plugin:test");
const monotonicNow = performance.now.bind(performance);

function checkCloudflareTestInjectTypes(
	poolInject: WorkerPoolOptionsContext["inject"]
) {
	const tmpPoolInstallationPath: string = poolInject("tmpPoolInstallationPath");
	void tmpPoolInstallationPath;

	const runtimeProvidedValue: number = poolInject<number>("runtimeProvidedKey");
	void runtimeProvidedValue;

	// @ts-expect-error ProvidedContext keys should be checked.
	poolInject("tmpPoolInstalltionPath");
}
void checkCloudflareTestInjectTypes;

export const vitestConfig = (
	cfOptions: Record<string, unknown> = {},
	testOptions: Record<string, unknown> = {}
) => dedent /* javascript */ `
	import { cloudflareTest } from "@cloudflare/vitest-plugin"

	import { BaseSequencer } from "vitest/node";

	class DeterministicSequencer extends BaseSequencer {
		sort(files) {
			return [...files].sort((a, b) => a.moduleId.localeCompare(b.moduleId));
		}
	}

	export default {
		plugins: [
			cloudflareTest({
				miniflare: {
					compatibilityDate: "2025-12-02",
					compatibilityFlags: ["nodejs_compat"],
				},
				...${JSON.stringify(cfOptions)}
			})
		],
		test: {
			sequence: { sequencer: DeterministicSequencer },
			testTimeout: 90_000,
			...${JSON.stringify(testOptions)}
		}
	};
`;

export function waitFor<T>(callback: Parameters<typeof vi.waitFor<T>>[0]) {
	// The default timeout of `vi.waitFor()` is only 1s, which is a little
	// short for some of these tests, especially on Windows.
	return vi.waitFor(callback, { timeout: 10_000, interval: 500 });
}

async function seed(root: string, files: Record<string, string>) {
	for (const [name, contents] of Object.entries(files)) {
		const filePath = path.resolve(root, name);
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(filePath, contents);
	}
}

export interface Process {
	readonly stdout: string;
	readonly stderr: string;
	readonly exitCode: Promise<number | NodeJS.Signals>;
	readonly closed: boolean;
}

interface WatchProcess extends Process {
	killParent(): Promise<void>;
}

function wrap(
	proc: childProcess.ChildProcess,
	options?: { maxBuffer: number; onOverflow(error: Error): void }
): Process {
	const output = { stdout: "", stderr: "" };
	const bytes = { stdout: 0, stderr: 0 };
	const errors: Error[] = [];
	let closed = false;
	proc.on("error", (error) => errors.push(error));
	const closePromise = new Promise<number | NodeJS.Signals>((resolve) => {
		proc.once("close", (code, signal) => {
			closed = true;
			resolve(code ?? signal ?? -1);
		});
	});
	function append(stream: "stdout" | "stderr", chunk: string) {
		const limit = options?.maxBuffer ?? Infinity;
		if (bytes[stream] > limit) {
			return;
		}
		const remaining = limit - bytes[stream];
		const size = Buffer.byteLength(chunk);
		bytes[stream] += size;
		output[stream] +=
			size > remaining
				? Buffer.from(chunk).subarray(0, remaining).toString()
				: chunk;
		if (size > remaining) {
			options?.onOverflow(
				new RangeError(`Watch ${stream} exceeded maxBuffer (${limit} bytes)`)
			);
		}
	}
	proc.stdout?.setEncoding("utf8");
	proc.stderr?.setEncoding("utf8");
	proc.stdout?.on("data", (chunk) => {
		if (debuglog.enabled) {
			process.stdout.write(chunk);
		}
		append("stdout", chunk);
	});
	proc.stderr?.on("data", (chunk) => {
		if (debuglog.enabled) {
			process.stderr.write(chunk);
		}
		append("stderr", chunk);
	});
	return {
		get stdout() {
			return stripAnsi(output.stdout);
		},
		get stderr() {
			return stripAnsi(output.stderr);
		},
		get exitCode() {
			return closePromise.then((code) => {
				if (errors.length === 1) {
					throw errors[0];
				}
				if (errors.length > 1) {
					throw new AggregateError(errors, "Watch process errors");
				}
				return code;
			});
		},
		get closed() {
			return closed;
		},
	};
}

// eslint-disable-next-line jest/expect-expect, jest/no-disabled-tests -- base test fixture definition, not an actual test
export const test = baseTest.extend<{
	tmpPath: string;
	seed: (files: Record<string, string>) => Promise<void>;
	vitestRun: (options?: {
		flags?: string[];
		maxBuffer?: number;
	}) => Promise<Process>;
	vitestDev: (options?: {
		flags?: string[];
		maxBuffer?: number;
	}) => WatchProcess;
}>({
	// Fixture for creating a temporary directory
	// eslint-disable-next-line no-empty-pattern -- Vitest requires the 1st argument to use object destructuring
	async tmpPath({}, use) {
		const tmpPoolInstallationPath = inject("tmpPoolInstallationPath");
		const tmpPathBase = path.join(tmpPoolInstallationPath, "test-");
		const tmpPath = await fs.mkdtemp(tmpPathBase);
		await use(tmpPath);
		// Retries can revisit this directory before an older watch cleanup finishes.
		const ownerPrefix = `watch-owner-${path.basename(tmpPath)}-`;
		if (
			(await fs.readdir(tmpPoolInstallationPath)).some((entry) =>
				entry.startsWith(ownerPrefix)
			)
		) {
			throw new Error(
				"Watch ownership is unresolved; temporary directory retained"
			);
		}
		await removeDir(tmpPath);
	},
	// Fixture for seeding data in the temporary directory
	async seed({ tmpPath }, use) {
		await use((files) => seed(tmpPath, files));
	},
	// Fixture for a starting single-shot `vitest run` process
	async vitestRun({ tmpPath }, use) {
		const tmpPoolInstallationPath = inject("tmpPoolInstallationPath");

		await use(async ({ flags = [], maxBuffer } = {}) => {
			// eslint-disable-next-line workers-sdk/no-unsafe-command-execution -- test helper
			const proc = childProcess.exec(
				`pnpm exec vitest run --root="${tmpPath}" ` + flags.join(" "),
				{
					cwd: tmpPoolInstallationPath,
					env: getNoCIEnv(),
					maxBuffer,
				}
			);
			const wrapped = wrap(proc);
			await wrapped.exitCode;
			return wrapped;
		});
	},
	// Fixture for a starting long-running `vitest dev` process
	async vitestDev({ tmpPath }, use) {
		const installation = inject("tmpPoolInstallationPath");
		// Retain the installation if any acquired owner cannot release its work.
		const ownerPath = await fs.mkdtemp(
			path.join(installation, `watch-owner-${path.basename(tmpPath)}-`)
		);
		const owners: Array<{
			proc: childProcess.ChildProcess;
			result: WatchProcess;
			stop(): void;
			close(): Promise<void>;
		}> = [];
		const errors: unknown[] = [];
		let closing = false;
		const windows = process.platform === "win32";
		const onExit = () => {
			// POSIX anchors stop their own groups when their IPC channel closes.
			if (!windows) {
				return;
			}
			for (const { proc } of owners) {
				if (proc.pid && proc.exitCode === null && proc.signalCode === null) {
					treeKill(proc.pid, "SIGKILL", (error) => {
						if (error) {
							console.error("Failed to stop watch process tree:", error);
						}
					});
				}
			}
		};
		process.on("exit", onExit);
		try {
			await use(({ flags = [], maxBuffer = 1024 * 1024 } = {}) => {
				if (closing) {
					throw new Error("Watch fixture is already closing");
				}
				if (!(maxBuffer >= 0)) {
					throw new RangeError("maxBuffer must be non-negative");
				}
				const command =
					`pnpm exec vitest dev --root="${tmpPath}" ` + flags.join(" ");
				// eslint-disable-next-line workers-sdk/no-unsafe-command-execution -- test helper retains the existing Windows command
				const proc = windows
					? childProcess.exec(command, {
							cwd: installation,
							env: getNoCIEnv(),
							maxBuffer,
						})
					: childProcess.fork(
							path.join(__dirname, "fixtures/watch-process.cjs"),
							[],
							{
								cwd: installation,
								env: getNoCIEnv(),
								execArgv: [],
								detached: true,
								silent: true,
							}
						);
				let recorded = false;
				let stopping = false;
				let parentKilled = false;
				let commandExit:
					| { code: number | null; signal: NodeJS.Signals | null }
					| undefined;
				let resolveParentKill: (() => void) | undefined;
				let rejectParentKill: ((error: Error) => void) | undefined;
				const send = (message: object, reject?: (error: Error) => void) => {
					if (!proc.connected) {
						throw new Error("Watch owner disconnected before cleanup");
					}
					proc.send(message, (error) => {
						if (error) {
							errors.push(error);
							reject?.(error);
						}
					});
				};
				const stop = () => {
					if (stopping) {
						return;
					}
					stopping = true;
					if (!windows) {
						send({ type: "stop" });
					}
				};
				const wrapped = wrap(
					proc,
					windows
						? undefined
						: {
								maxBuffer,
								onOverflow(error) {
									errors.push(error);
									try {
										stop();
									} catch (stopError) {
										errors.push(stopError);
									}
								},
							}
				);
				// Observe native errors without allowing them to reject the close join early.
				const nativeClose = wrapped.exitCode;
				void nativeClose.catch((error) => errors.push(error));
				proc.on("message", (raw) => {
					const message = raw as {
						type: string;
						name?: string;
						message?: string;
						code: number | null;
						signal: NodeJS.Signals | null;
					};
					if (message.type === "ready" && recorded && !stopping) {
						try {
							send({ type: "start", command });
						} catch (error) {
							errors.push(error);
						}
					} else if (message.type === "command-exit") {
						commandExit = message;
					} else if (message.type === "command-error") {
						errors.push(
							Object.assign(new Error(message.message), {
								name: message.name,
								code: message.code,
							})
						);
					} else if (message.type === "parent-killed") {
						parentKilled = true;
						resolveParentKill?.();
					} else if (message.type === "parent-kill-error") {
						rejectParentKill?.(
							new Error("Watch parent must be running before it is killed")
						);
					}
				});
				proc.once("close", () =>
					rejectParentKill?.(
						new Error("Watch owner closed before confirming parent exit")
					)
				);
				const result = Object.assign(wrapped, {
					async killParent() {
						if (windows || stopping || resolveParentKill) {
							throw new Error("Watch parent cannot be killed in this state");
						}
						await new Promise<void>((resolve, reject) => {
							resolveParentKill = resolve;
							rejectParentKill = reject;
							try {
								send({ type: "kill-parent" }, reject);
							} catch (error) {
								reject(error);
							}
						});
					},
				});
				owners.push({
					proc,
					result,
					stop,
					async close() {
						if (!proc.pid) {
							await nativeClose.catch(() => {});
							return;
						}
						if (windows) {
							if (proc.exitCode !== null || proc.signalCode !== null) {
								throw new Error(
									"Watch process exited before cleanup; its descendants cannot be safely discovered on Windows."
								);
							}
							// A failed tree discovery cannot make inherited pipes close.
							await util.promisify<number, string>(treeKill)(
								proc.pid,
								"SIGKILL"
							);
							const timeout = new AbortController();
							try {
								await Promise.race([
									nativeClose.catch(() => {}),
									delay(5_000, undefined, { signal: timeout.signal }).then(
										() => {
											throw new Error(
												"Watch process did not close after termination; installation retained"
											);
										}
									),
								]);
							} finally {
								timeout.abort();
							}
							return;
						}
						try {
							try {
								stop();
							} catch (error) {
								errors.push(error);
							}
							const deadline = monotonicNow() + 5_000;
							// Only query this group after requesting its live owner to stop. Never
							// signal a stored PGID after its leader may have exited and been reaped.
							while (!wrapped.closed || groupExists(proc.pid)) {
								if (monotonicNow() >= deadline) {
									throw new Error(
										"Watch owner did not release its process group; installation retained"
									);
								}
								await delay(10);
							}
							await nativeClose.catch(() => {});
						} finally {
							if (commandExit && !parentKilled) {
								errors.push(
									new Error(
										`Watch command exited unexpectedly (${commandExit.code ?? commandExit.signal})`
									)
								);
							}
						}
					},
				});
				// The ready/start handshake ensures this record precedes command spawn.
				writeFileSync(
					path.join(ownerPath, "processes.json"),
					JSON.stringify(
						owners.map(({ proc: child }) => ({
							pid: child.pid,
							group: windows ? null : child.pid,
						}))
					),
					{ mode: 0o600 }
				);
				recorded = true;
				return result;
			});
		} catch (error) {
			errors.push(error);
		} finally {
			closing = true;
			const settled = await Promise.allSettled(
				owners.map((owner) => owner.close())
			);
			for (const item of settled) {
				if (item.status === "rejected") {
					errors.push(item.reason);
				}
			}
			const released =
				settled.every((item) => item.status === "fulfilled") &&
				owners.every(({ result }) => result.closed);
			if (released) {
				try {
					await removeDir(ownerPath);
				} catch (error) {
					errors.push(error);
				}
			}
			if (released) {
				process.off("exit", onExit);
			}
		}
		if (errors.length === 1) {
			throw errors[0];
		}
		if (errors.length > 1) {
			throw new AggregateError(errors, "Watch fixture and cleanup failed");
		}
	},
});

function groupExists(pid: number): boolean {
	try {
		process.kill(-pid, 0);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ESRCH") {
			return false;
		}
		throw error;
	}
}

/**
 * Get a copy of the process.env that will not be interpreted by Vitest as running in CI.
 *
 * This is important for the snapshot update tests to execute correctly.
 * Vitest uses the `std-env` library's `isCI()` call to determine this.
 * Since we currently use GitHub Actions to run our CI jobs, this is what we are turning off here.
 * If we change CI provider then we should update this.
 */
function getNoCIEnv(): typeof process.env {
	const env = { ...process.env };
	env.CI = undefined;
	env.GITHUB_ACTIONS = undefined;
	// Suppress Node.js deprecation warnings in spawned processes to prevent
	// them from appearing in stderr (which breaks tests that assert stderr is empty)
	env.NODE_OPTIONS = [env.NODE_OPTIONS, "--no-deprecation"]
		.filter(Boolean)
		.join(" ");
	return env;
}
