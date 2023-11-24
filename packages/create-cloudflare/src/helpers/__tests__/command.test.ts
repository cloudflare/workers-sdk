import { spawn } from "cross-spawn";
import { detectPackageManager } from "helpers/packages";
import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import whichPMRuns from "which-pm-runs";
import {
	getWorkerdCompatibilityDate,
	installPackages,
	installWrangler,
	npmInstall,
	runCommand,
} from "../command";

// We can change how the mock spawn works by setting these variables
let spawnResultCode = 0;
let spawnStdout: string | undefined = undefined;
let spawnStderr: string | undefined = undefined;

describe("Command Helpers", () => {
	afterEach(() => {
		vi.clearAllMocks();
		spawnResultCode = 0;
		spawnStdout = undefined;
		spawnStderr = undefined;
	});

	beforeEach(() => {
		// Mock out the child_process.spawn function
		vi.mock("cross-spawn", () => {
			const mockedSpawn = vi.fn().mockImplementation(() => {
				return {
					on: vi.fn().mockImplementation((event, cb) => {
						if (event === "close") {
							cb(spawnResultCode);
						}
					}),
					stdout: {
						on(event: "data", cb: (data: string) => void) {
							spawnStdout !== undefined && cb(spawnStdout);
						},
					},
					stderr: {
						on(event: "data", cb: (data: string) => void) {
							spawnStderr !== undefined && cb(spawnStderr);
						},
					},
				};
			});

			return { spawn: mockedSpawn };
		});
		vi.mock("which-pm-runs");
		vi.mocked(whichPMRuns).mockReturnValue({ name: "npm", version: "8.3.1" });

		vi.mock("fs", () => ({
			existsSync: vi.fn(() => false),
		}));
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

	test("npmInstall", async () => {
		await npmInstall();
		expectSilentSpawnWith("npm install");
	});

	test("npmInstall from pnpm", async () => {
		vi.mocked(whichPMRuns).mockReturnValue({
			name: "pnpm",
			version: "8.5.1",
		});

		await npmInstall();
		expectSilentSpawnWith("pnpm install");
	});

	test("installPackages", async () => {
		await installPackages(["foo", "bar", "baz"], { dev: true });
		expectSilentSpawnWith("npm install --save-dev foo bar baz");
	});

	describe("detectPackageManager", async () => {
		let pm = detectPackageManager();

		test("npm", () => {
			expect(pm.npm).toBe("npm");
			expect(pm.npx).toBe("npx");
			expect(pm.dlx).toEqual(["npx"]);
		});

		test("pnpm", () => {
			vi.mocked(whichPMRuns).mockReturnValue({
				name: "pnpm",
				version: "8.5.1",
			});
			pm = detectPackageManager();
			expect(pm.npm).toBe("pnpm");
			expect(pm.npx).toBe("pnpm");
			expect(pm.dlx).toEqual(["pnpm", "dlx"]);

			vi.mocked(whichPMRuns).mockReturnValue({
				name: "pnpm",
				version: "6.35.1",
			});
			pm = detectPackageManager();
			expect(pm.npm).toBe("pnpm");
			expect(pm.npx).toBe("pnpm");
			expect(pm.dlx).toEqual(["pnpm", "dlx"]);

			vi.mocked(whichPMRuns).mockReturnValue({
				name: "pnpm",
				version: "5.18.10",
			});
			pm = detectPackageManager();
			expect(pm.npm).toBe("pnpm");
			expect(pm.npx).toBe("pnpx");
			expect(pm.dlx).toEqual(["pnpx"]);
		});

		test("yarn", () => {
			vi.mocked(whichPMRuns).mockReturnValue({
				name: "yarn",
				version: "3.5.1",
			});
			pm = detectPackageManager();
			expect(pm.npm).toBe("yarn");
			expect(pm.npx).toBe("yarn");
			expect(pm.dlx).toEqual(["yarn", "dlx"]);

			vi.mocked(whichPMRuns).mockReturnValue({
				name: "yarn",
				version: "1.22.0",
			});
			pm = detectPackageManager();
			expect(pm.npm).toBe("yarn");
			expect(pm.npx).toBe("yarn");
			expect(pm.dlx).toEqual(["yarn"]);
		});
	});

	describe("getWorkerdCompatibilityDate()", () => {
		test("normal flow", async () => {
			spawnStdout = "2.20250110.5";
			const date = await getWorkerdCompatibilityDate();
			expectSilentSpawnWith("npm info workerd dist-tags.latest");
			expect(date).toBe("2025-01-10");
		});

		test("empty result", async () => {
			spawnStdout = "";
			const date = await getWorkerdCompatibilityDate();
			expectSilentSpawnWith("npm info workerd dist-tags.latest");
			expect(date).toBe("2023-05-18");
		});

		test("verbose output (e.g. yarn or debug mode)", async () => {
			spawnStdout =
				"Debugger attached.\nyarn info v1.22.19\n2.20250110.5\n✨  Done in 0.83s.";
			const date = await getWorkerdCompatibilityDate();
			expectSilentSpawnWith("npm info workerd dist-tags.latest");
			expect(date).toBe("2025-01-10");
		});

		test("command failed", async () => {
			spawnResultCode = 1;
			const date = await getWorkerdCompatibilityDate();
			expectSilentSpawnWith("npm info workerd dist-tags.latest");
			expect(date).toBe("2023-05-18");
		});
	});
});
