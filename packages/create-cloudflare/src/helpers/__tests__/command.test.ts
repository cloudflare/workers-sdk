import { spawn } from "child_process";
import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import whichPMRuns from "which-pm-runs";
import {
	detectPackageManager,
	installPackages,
	installWrangler,
	npmInstall,
	runCommand,
} from "../command";

describe("Command Helpers", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	beforeEach(() => {
		// Mock out the child_process.spawn function
		vi.mock("child_process", () => {
			const mockedSpawn = vi.fn().mockImplementation(() => ({
				on: vi.fn().mockImplementation((event, cb) => {
					if (event === "close") {
						cb(0);
					}
				}),
			}));

			return { spawn: mockedSpawn };
		});

		vi.mock("which-pm-runs");
		vi.mocked(whichPMRuns).mockReturnValue({ name: "npm", version: "dev" });

		vi.mock("fs", () => ({
			existsSync: vi.fn(() => false),
		}));
	});

	const expectSpawnWith = (cmd: string) => {
		const [command, ...args] = cmd.split(" ");

		expect(spawn).toHaveBeenCalledWith(command, args, {
			stdio: "pipe",
			env: process.env,
		});
	};

	test("runCommand", async () => {
		await runCommand("ls -l");
		expectSpawnWith("ls -l");
	});

	test("installWrangler", async () => {
		await installWrangler();
		expectSpawnWith("npm install --save-dev wrangler");
	});

	test("npmInstall", async () => {
		await npmInstall();
		expectSpawnWith("npm install");
	});

	test("npmInstall from pnpm", async () => {
		vi.mocked(whichPMRuns).mockReturnValue({
			name: "pnpm",
			version: "dev",
		});

		await npmInstall();
		expectSpawnWith("pnpm install");
	});

	test("installPackages", async () => {
		await installPackages(["foo", "bar", "baz"], { dev: true });
		expectSpawnWith("npm install --save-dev foo bar baz");
	});

	test("detectPackageManager", async () => {
		let pm = detectPackageManager();
		expect(pm.npm).toBe("npm");
		expect(pm.npx).toBe("npx");

		vi.mocked(whichPMRuns).mockReturnValue({
			name: "pnpm",
			version: "dev",
		});
		pm = detectPackageManager();
		expect(pm.npm).toBe("pnpm");
		expect(pm.npx).toBe("pnpx");

		vi.mocked(whichPMRuns).mockReturnValue({
			name: "yarn",
			version: "dev",
		});
		pm = detectPackageManager();
		expect(pm.npm).toBe("yarn");
		expect(pm.npx).toBe("npx");
	});
});
