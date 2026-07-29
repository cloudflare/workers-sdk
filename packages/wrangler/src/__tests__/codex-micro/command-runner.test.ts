import { ChildProcess } from "node:child_process";
import process from "node:process";
import { describe, it, vi } from "vitest";
import { CodexMicroCommandRunner } from "../../codex-micro/command-runner";
import { mockConsoleMethods } from "../helpers/mock-console";
import type { CodexMicroCommandRunnerOptions } from "../../codex-micro/command-runner";

type SpawnProcess = NonNullable<CodexMicroCommandRunnerOptions["spawnProcess"]>;

describe("CodexMicroCommandRunner", () => {
	const std = mockConsoleMethods();

	it("starts the mapped Wrangler command without a shell", ({ expect }) => {
		const child = createChild(41);
		const spawnProcess = vi.fn<SpawnProcess>(() => child);
		const runner = new CodexMicroCommandRunner({
			cliPath: "/opt/wrangler/cli.js",
			projectPath: "/work/project",
			spawnProcess,
		});

		runner.handleKey({ key: "AG01", action: 1 });

		expect(spawnProcess).toHaveBeenCalledWith(
			process.execPath,
			[
				"--no-warnings",
				"/opt/wrangler/cli.js",
				"--cwd",
				"/work/project",
				"deploy",
				"--dry-run",
			],
			{
				cwd: "/work/project",
				detached: true,
				env: process.env,
				stdio: ["ignore", "inherit", "inherit"],
			}
		);
	});

	it("runs arbitrary configured Wrangler arguments", ({ expect }) => {
		const child = createChild(46);
		const spawnProcess = vi.fn<SpawnProcess>(() => child);
		const runner = new CodexMicroCommandRunner({
			cliPath: "/opt/wrangler/cli.js",
			keymap: {
				AG01: `tail --format json --search "status = 500"`,
				AG05: "versions list --env staging",
			},
			projectPath: "/work/project",
			spawnProcess,
		});

		runner.handleKey({ key: "AG01", action: 1 });
		child.emit("exit", 0, null);
		runner.handleKey({ key: "AG05", action: 1 });

		expect(spawnProcess.mock.calls[0]?.[1]).toEqual([
			"--no-warnings",
			"/opt/wrangler/cli.js",
			"--cwd",
			"/work/project",
			"tail",
			"--format",
			"json",
			"--search",
			"status = 500",
		]);
		expect(spawnProcess.mock.calls[1]?.[1]).toEqual([
			"--no-warnings",
			"/opt/wrangler/cli.js",
			"--cwd",
			"/work/project",
			"versions",
			"list",
			"--env",
			"staging",
		]);
		expect(std.out).not.toContain("status = 500");
		expect(std.out).not.toContain("--env staging");
	});

	it("runs configured rotary dial actions", ({ expect }) => {
		const clockwise = createChild(48);
		const counterclockwise = createChild(49);
		const press = createChild(50);
		const spawnProcess = vi
			.fn<SpawnProcess>()
			.mockReturnValueOnce(clockwise)
			.mockReturnValueOnce(counterclockwise)
			.mockReturnValueOnce(press);
		const runner = new CodexMicroCommandRunner({
			cliPath: "/opt/wrangler/cli.js",
			keymap: {
				ENC_CW: "deployments status --json",
				ENC_CC: "versions list",
				ENC: "whoami",
			},
			projectPath: "/work/project",
			spawnProcess,
		});

		runner.handleKey({ key: "ENC_CW", action: 2 });
		clockwise.emit("exit", 0, null);
		runner.handleKey({ key: "ENC_CC", action: 2 });
		counterclockwise.emit("exit", 0, null);
		runner.handleKey({ key: "ENC", action: 1 });
		runner.handleKey({ key: "ENC", action: 0 });

		expect(spawnProcess.mock.calls.map((call) => call[1].slice(4))).toEqual([
			["deployments", "status", "--json"],
			["versions", "list"],
			["whoami"],
		]);
	});

	it("requires a second deploy press within the confirmation window", ({
		expect,
	}) => {
		let now = 1_000;
		const spawnProcess = vi.fn<SpawnProcess>(() => createChild(42));
		const runner = new CodexMicroCommandRunner({
			cliPath: "/opt/wrangler/cli.js",
			projectPath: "/work/project",
			now: () => now,
			spawnProcess,
		});

		runner.handleKey({ key: "AG02", action: 1 });
		expect(spawnProcess).not.toHaveBeenCalled();

		now = 2_000;
		runner.handleKey({ key: "AG02", action: 1 });
		expect(spawnProcess).toHaveBeenCalledOnce();
		expect(spawnProcess.mock.calls[0]?.[1]).toContain("deploy");
	});

	it("does not arm deploy confirmation while deploy is active", ({
		expect,
	}) => {
		let now = 1_000;
		const firstDeploy = createChild(51);
		const secondDeploy = createChild(52);
		const spawnProcess = vi
			.fn<SpawnProcess>()
			.mockReturnValueOnce(firstDeploy)
			.mockReturnValueOnce(secondDeploy);
		const runner = new CodexMicroCommandRunner({
			cliPath: "/opt/wrangler/cli.js",
			projectPath: "/work/project",
			now: () => now,
			spawnProcess,
		});

		runner.handleKey({ key: "AG02", action: 1 });
		now = 1_100;
		runner.handleKey({ key: "AG02", action: 1 });

		now = 2_000;
		runner.handleKey({ key: "AG02", action: 1 });
		firstDeploy.emit("exit", 0, null);

		now = 2_100;
		runner.handleKey({ key: "AG02", action: 1 });
		expect(spawnProcess).toHaveBeenCalledOnce();

		now = 2_200;
		runner.handleKey({ key: "AG02", action: 1 });
		expect(spawnProcess).toHaveBeenCalledTimes(2);
	});

	it("runs a configured AG02 action without interpreting it", ({ expect }) => {
		const spawnProcess = vi.fn<SpawnProcess>(() => createChild(47));
		const runner = new CodexMicroCommandRunner({
			cliPath: "/opt/wrangler/cli.js",
			keymap: { AG02: "deploy --env staging" },
			projectPath: "/work/project",
			spawnProcess,
		});

		runner.handleKey({ key: "AG02", action: 1 });

		expect(spawnProcess).toHaveBeenCalledOnce();
		expect(spawnProcess.mock.calls[0]?.[1]).toContain("--env");
		expect(spawnProcess.mock.calls[0]?.[1]).toContain("staging");
	});

	it("toggles long-running commands and ignores key releases", ({ expect }) => {
		const child = createChild(43);
		const spawnProcess = vi.fn<SpawnProcess>(() => child);
		const killProcess = vi.fn();
		const runner = new CodexMicroCommandRunner({
			cliPath: "/opt/wrangler/cli.js",
			projectPath: "/work/project",
			spawnProcess,
			killProcess,
		});

		runner.handleKey({ key: "AG00", action: 0 });
		expect(spawnProcess).not.toHaveBeenCalled();

		runner.handleKey({ key: "AG00", action: 1 });
		runner.handleKey({ key: "AG00", action: 1 });

		expect(spawnProcess).toHaveBeenCalledOnce();
		expect(killProcess).toHaveBeenCalledWith(43, "SIGTERM");
	});

	it("stops every active command with AG05", ({ expect }) => {
		const dev = createChild(44);
		const tail = createChild(45);
		const spawnProcess = vi
			.fn<SpawnProcess>()
			.mockReturnValueOnce(dev)
			.mockReturnValueOnce(tail);
		const killProcess = vi.fn();
		const runner = new CodexMicroCommandRunner({
			cliPath: "/opt/wrangler/cli.js",
			projectPath: "/work/project",
			spawnProcess,
			killProcess,
		});

		runner.handleKey({ key: "AG00", action: 1 });
		runner.handleKey({ key: "AG03", action: 1 });
		runner.handleKey({ key: "AG05", action: 1 });

		expect(killProcess).toHaveBeenCalledTimes(2);
		expect(killProcess).toHaveBeenCalledWith(44, "SIGTERM");
		expect(killProcess).toHaveBeenCalledWith(45, "SIGTERM");
	});

	it("uses AG05 to stop all when its configured action is empty", ({
		expect,
	}) => {
		const dev = createChild(53);
		const spawnProcess = vi.fn<SpawnProcess>(() => dev);
		const killProcess = vi.fn();
		const runner = new CodexMicroCommandRunner({
			cliPath: "/opt/wrangler/cli.js",
			keymap: { AG05: "   " },
			projectPath: "/work/project",
			spawnProcess,
			killProcess,
		});

		runner.handleKey({ key: "AG00", action: 1 });
		runner.handleKey({ key: "AG05", action: 1 });

		expect(killProcess).toHaveBeenCalledOnce();
		expect(killProcess).toHaveBeenCalledWith(53, "SIGTERM");
	});
});

function createChild(pid: number): ChildProcess {
	const child = new ChildProcess();
	Object.defineProperty(child, "pid", { value: pid });
	return child;
}
