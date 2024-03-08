import { existsSync } from "fs";
import { spawn } from "cross-spawn";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import whichPMRuns from "which-pm-runs";
import { installWrangler, runCommand } from "../command";
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
		// Mock out the child_process.spawn function
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

	const expectSilentSpawnWith = (cmd: string) => {
		const [command, ...args] = cmd.split(" ");

		expect(spawn).toHaveBeenCalledWith(command, args, {
			stdio: "pipe",
			env: process.env,
		});
	};

	test("runCommand", async () => {
		await runCommand(["ls", "-l"]);
		expect(spawn).toHaveBeenCalledWith("ls", ["-l"], {
			stdio: "inherit",
			env: process.env,
		});
	});

	test("installWrangler", async () => {
		await installWrangler();

		expectSilentSpawnWith("npm install --save-dev wrangler");
	});
});
