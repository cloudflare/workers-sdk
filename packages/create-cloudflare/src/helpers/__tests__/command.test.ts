import { existsSync } from "node:fs";
import { spawn } from "cross-spawn";
import { readMetricsConfig } from "helpers/metrics-config";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import whichPMRuns from "which-pm-runs";
import { quoteShellArgs, runCommand } from "../command";
import type { ChildProcess } from "node:child_process";

// We can change how the mock spawn works by setting these variables
let spawnResultCode = 0;
let spawnStdout: string | undefined = undefined;
let spawnStderr: string | undefined = undefined;

vi.mock("cross-spawn");
vi.mock("fs");
vi.mock("which-pm-runs");
vi.mock("helpers/metrics-config");

describe("Command Helpers", () => {
	afterEach(() => {
		spawnResultCode = 0;
		spawnStdout = undefined;
		spawnStderr = undefined;
	});

	beforeEach(() => {
		vi.mocked(spawn).mockImplementation(() => {
			return {
				on: vi.fn().mockImplementation((event, cb) => {
					if (event === "close") {
						cb(spawnResultCode);
					}
				}),
				stdout: {
					on(_event: "data", cb: (data: string) => void) {
						if (spawnStdout !== undefined) {
							cb(spawnStdout);
						}
					},
				},
				stderr: {
					on(_event: "data", cb: (data: string) => void) {
						if (spawnStderr !== undefined) {
							cb(spawnStderr);
						}
					},
				},
			} as unknown as ChildProcess;
		});

		vi.mocked(whichPMRuns).mockReturnValue({ name: "npm", version: "8.3.1" });
		vi.mocked(existsSync).mockImplementation(() => false);
	});

	test("runCommand", async ({ expect }) => {
		await runCommand(["ls", "-l"]);
		expect(spawn).toHaveBeenCalledWith("ls", ["-l"], {
			stdio: "inherit",
			env: process.env,
			signal: expect.any(AbortSignal),
		});
	});

	describe("respect telemetry permissions when running wrangler", () => {
		test("runCommand has WRANGLER_SEND_METRICS=false if its a wrangler command and c3 telemetry is disabled", async ({
			expect,
		}) => {
			vi.mocked(readMetricsConfig).mockReturnValue({
				c3permission: {
					enabled: false,
					date: new Date(2000),
				},
			});
			await runCommand(["npx", "wrangler"]);

			expect(spawn).toHaveBeenCalledWith(
				"npx",
				["wrangler"],
				expect.objectContaining({
					env: expect.objectContaining({ WRANGLER_SEND_METRICS: "false" }),
				}),
			);
		});

		test("runCommand doesn't have WRANGLER_SEND_METRICS=false if its a wrangler command and c3 telemetry is enabled", async ({
			expect,
		}) => {
			vi.mocked(readMetricsConfig).mockReturnValue({
				c3permission: {
					enabled: true,
					date: new Date(2000),
				},
			});
			await runCommand(["npx", "wrangler"]);

			expect(spawn).toHaveBeenCalledWith(
				"npx",
				["wrangler"],
				expect.objectContaining({
					env: expect.not.objectContaining({ WRANGLER_SEND_METRICS: "false" }),
				}),
			);
		});

		test("runCommand doesn't have WRANGLER_SEND_METRICS=false if not a wrangler command", async ({
			expect,
		}) => {
			vi.mocked(readMetricsConfig).mockReturnValue({
				c3permission: {
					enabled: false,
					date: new Date(2000),
				},
			});
			await runCommand(["ls", "-l"]);

			expect(spawn).toHaveBeenCalledWith(
				"ls",
				["-l"],
				expect.objectContaining({
					env: expect.not.objectContaining({ WRANGLER_SEND_METRICS: "false" }),
				}),
			);
		});
	});

	describe("quoteShellArgs", () => {
		test.runIf(process.platform !== "win32")("mac", async ({ expect }) => {
			expect(quoteShellArgs([`pages:dev`])).toEqual("pages:dev");
			expect(quoteShellArgs([`24.02 foo-bar`])).toEqual(`'24.02 foo-bar'`);
			expect(quoteShellArgs([`foo/10 bar/20-baz/`])).toEqual(
				`'foo/10 bar/20-baz/'`,
			);
		});

		test.runIf(process.platform === "win32")("windows", async ({ expect }) => {
			expect(quoteShellArgs([`pages:dev`])).toEqual("pages:dev");
			expect(quoteShellArgs([`24.02 foo-bar`])).toEqual(`"24.02 foo-bar"`);
			expect(quoteShellArgs([`foo/10 bar/20-baz/`])).toEqual(
				`"foo/10 bar/20-baz/"`,
			);
		});
	});
});
