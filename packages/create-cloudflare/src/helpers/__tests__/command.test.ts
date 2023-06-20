import { spawn } from "cross-spawn";
import { detectPackageManager } from "helpers/packages";
import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import whichPMRuns from "which-pm-runs";
import {
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
		vi.mock("cross-spawn", () => {
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
		vi.mocked(whichPMRuns).mockReturnValue({ name: "npm", version: "8.3.1" });

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

		await runCommand(" ls -l ");
		expectSpawnWith("ls -l");

		await runCommand(" ls  -l ");
		expectSpawnWith("ls -l");

		await runCommand(" ls \t -l ");
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
			version: "8.5.1",
		});

		await npmInstall();
		expectSpawnWith("pnpm install");
	});

	test("installPackages", async () => {
		await installPackages(["foo", "bar", "baz"], { dev: true });
		expectSpawnWith("npm install --save-dev foo bar baz");
	});

	describe("detectPackageManager", async () => {
		let pm = detectPackageManager();

		test("npm", () => {
			expect(pm.npm).toBe("npm");
			expect(pm.npx).toBe("npx");
			expect(pm.dlx).toBe("npx");
		});

		test("pnpm", () => {
			vi.mocked(whichPMRuns).mockReturnValue({
				name: "pnpm",
				version: "8.5.1",
			});
			pm = detectPackageManager();
			expect(pm.npm).toBe("pnpm");
			expect(pm.npx).toBe("pnpm");
			expect(pm.dlx).toBe("pnpm dlx");

			vi.mocked(whichPMRuns).mockReturnValue({
				name: "pnpm",
				version: "6.35.1",
			});
			pm = detectPackageManager();
			expect(pm.npm).toBe("pnpm");
			expect(pm.npx).toBe("pnpm");
			expect(pm.dlx).toBe("pnpm dlx");

			vi.mocked(whichPMRuns).mockReturnValue({
				name: "pnpm",
				version: "5.18.10",
			});
			pm = detectPackageManager();
			expect(pm.npm).toBe("pnpm");
			expect(pm.npx).toBe("pnpx");
			expect(pm.dlx).toBe("pnpx");
		});

		test("yarn", () => {
			vi.mocked(whichPMRuns).mockReturnValue({
				name: "yarn",
				version: "3.5.1",
			});
			pm = detectPackageManager();
			expect(pm.npm).toBe("yarn");
			expect(pm.npx).toBe("yarn");
			expect(pm.dlx).toBe("yarn dlx");

			vi.mocked(whichPMRuns).mockReturnValue({
				name: "yarn",
				version: "1.22.0",
			});
			pm = detectPackageManager();
			expect(pm.npm).toBe("yarn");
			expect(pm.npx).toBe("yarn");
			expect(pm.dlx).toBe("yarn");
		});
	});
});
