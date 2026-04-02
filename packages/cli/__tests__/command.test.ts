import { spawn } from "cross-spawn";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import { quoteShellArgs, runCommand } from "../command";
import type { ChildProcess } from "node:child_process";

// We can change how the mock spawn works by setting these variables
let spawnResultCode = 0;
let spawnStdout: string | undefined = undefined;
let spawnStderr: string | undefined = undefined;

vi.mock("cross-spawn");

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
	});

	test("runCommand", async ({ expect }) => {
		await runCommand(["ls", "-l"]);
		expect(spawn).toHaveBeenCalledWith("ls", ["-l"], {
			stdio: "inherit",
			env: process.env,
			signal: expect.any(AbortSignal),
		});
	});

	describe("quoteShellArgs", () => {
		test.runIf(process.platform !== "win32")("mac", async ({ expect }) => {
			expect(quoteShellArgs([`pages:dev`])).toEqual("pages:dev");
			expect(quoteShellArgs([`24.02 foo-bar`])).toEqual(`'24.02 foo-bar'`);
			expect(quoteShellArgs([`foo/10 bar/20-baz/`])).toEqual(
				`'foo/10 bar/20-baz/'`
			);
		});

		test.runIf(process.platform === "win32")("windows", async ({ expect }) => {
			expect(quoteShellArgs([`pages:dev`])).toEqual("pages:dev");
			expect(quoteShellArgs([`24.02 foo-bar`])).toEqual(`"24.02 foo-bar"`);
			expect(quoteShellArgs([`foo/10 bar/20-baz/`])).toEqual(
				`"foo/10 bar/20-baz/"`
			);
		});
	});
});
