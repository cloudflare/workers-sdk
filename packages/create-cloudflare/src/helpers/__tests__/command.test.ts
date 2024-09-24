import { existsSync } from "fs";
import { spawn } from "cross-spawn";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import whichPMRuns from "which-pm-runs";
import { quoteShellArgs, runCommand } from "../command";
import type { ChildProcess } from "child_process";

// We can change how the mock spawn works by setting these variables
let spawnResultCode = 0;
let spawnStdout: string | undefined = undefined;
let spawnStderr: string | undefined = undefined;

vi.mock("cross-spawn");
vi.mock("fs");
vi.mock("which-pm-runs");

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
						spawnStdout !== undefined && cb(spawnStdout);
					},
				},
				stderr: {
					on(_event: "data", cb: (data: string) => void) {
						spawnStderr !== undefined && cb(spawnStderr);
					},
				},
			} as unknown as ChildProcess;
		});

		vi.mocked(whichPMRuns).mockReturnValue({ name: "npm", version: "8.3.1" });
		vi.mocked(existsSync).mockImplementation(() => false);
	});

	test("runCommand", async () => {
		await runCommand(["ls", "-l"]);
		expect(spawn).toHaveBeenCalledWith("ls", ["-l"], {
			stdio: "inherit",
			env: process.env,
			signal: expect.any(AbortSignal),
		});
	});

	describe("quoteShellArgs", () => {
		test.runIf(process.platform !== "win32")("mac", async () => {
			expect(quoteShellArgs([`pages:dev`])).toEqual("pages:dev");
			expect(quoteShellArgs([`24.02 foo-bar`])).toEqual(`'24.02 foo-bar'`);
			expect(quoteShellArgs([`foo/10 bar/20-baz/`])).toEqual(
				`'foo/10 bar/20-baz/'`,
			);
		});

		test.runIf(process.platform === "win32")("windows", async () => {
			expect(quoteShellArgs([`pages:dev`])).toEqual("pages:dev");
			expect(quoteShellArgs([`24.02 foo-bar`])).toEqual(`"24.02 foo-bar"`);
			expect(quoteShellArgs([`foo/10 bar/20-baz/`])).toEqual(
				`"foo/10 bar/20-baz/"`,
			);
		});
	});
});
