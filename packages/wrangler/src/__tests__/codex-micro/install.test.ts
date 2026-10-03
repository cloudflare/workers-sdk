import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import {
	createLaunchAgentPlist,
	createSystemdUnit,
	installCodexMicroDaemon,
} from "../../codex-micro/install";
import type { ExecuteSystemCommand } from "../../codex-micro/install";

describe("Codex Micro daemon installation", () => {
	runInTempDir();

	let cliPath: string;
	let configPath: string;
	let homePath: string;
	let nodePath: string;
	let projectPath: string;

	beforeEach(async () => {
		homePath = path.resolve("home");
		configPath = path.resolve("wrangler-config", "codex-micro");
		projectPath = path.resolve("project");
		cliPath = path.resolve("wrangler.js");
		nodePath = path.resolve("node");

		await mkdir(projectPath);
		await writeFile(cliPath, "#!/usr/bin/env node\n");
		await writeFile(nodePath, "#!/bin/sh\n");
		await chmod(nodePath, 0o700);
	});

	it("installs and starts a macOS LaunchAgent", async ({ expect }) => {
		const execute = vi.fn<ExecuteSystemCommand>(async () => 0);

		await installCodexMicroDaemon({
			cliPath,
			configPath,
			execute,
			homePath,
			nodePath,
			pathEnvironment: "/opt/bin:/usr/bin",
			platform: "darwin",
			projectPath,
			uid: 501,
		});

		const plistPath = path.join(
			homePath,
			"Library",
			"LaunchAgents",
			"com.cloudflare.wrangler-codex-micro.plist"
		);
		const plist = await readFile(plistPath, "utf8");
		expect(plist).toContain("<string>--run-codex-daemon</string>");
		expect(plist).toContain(`<string>${projectPath}</string>`);
		expect(execute).toHaveBeenNthCalledWith(
			1,
			"launchctl",
			["bootout", "gui/501/com.cloudflare.wrangler-codex-micro"],
			{ allowFailure: true }
		);
		expect(execute).toHaveBeenNthCalledWith(2, "launchctl", [
			"bootstrap",
			"gui/501",
			plistPath,
		]);
		expect(execute).toHaveBeenNthCalledWith(3, "launchctl", [
			"kickstart",
			"-k",
			"gui/501/com.cloudflare.wrangler-codex-micro",
		]);
	});

	it("installs Linux HID permissions and a user service", async ({
		expect,
	}) => {
		const execute = vi.fn<ExecuteSystemCommand>(async () => 0);

		await installCodexMicroDaemon({
			cliPath,
			configPath,
			execute,
			homePath,
			nodePath,
			pathEnvironment: "/opt/bin:/usr/bin",
			platform: "linux",
			projectPath,
		});

		const unitPath = path.join(
			homePath,
			".config",
			"systemd",
			"user",
			"wrangler-codex-micro.service"
		);
		const unit = await readFile(unitPath, "utf8");
		const rule = await readFile(
			path.join(configPath, "codex-micro.rules"),
			"utf8"
		);

		expect(unit).toContain("ExecStart=");
		expect(unit).toContain('"--run-codex-daemon"');
		expect(unit).toContain("WantedBy=default.target");
		expect(rule).toContain('ATTRS{idVendor}=="303a"');
		expect(rule).toContain('ATTRS{idProduct}=="8360"');
		expect(execute).toHaveBeenCalledWith(
			"sudo",
			[
				"install",
				"-m",
				"0644",
				path.join(configPath, "codex-micro.rules"),
				"/etc/udev/rules.d/70-wrangler-codex-micro.rules",
			],
			{ inheritStdio: true }
		);
		expect(execute).toHaveBeenCalledWith("systemctl", [
			"--user",
			"enable",
			"--now",
			"wrangler-codex-micro.service",
		]);
	});

	it("escapes service file values", ({ expect }) => {
		expect(
			createLaunchAgentPlist({
				cliPath: "/tmp/wrangler&cli.js",
				nodePath: "/tmp/node",
				pathEnvironment: "/tmp/a&b",
				projectPath: "/tmp/project<one>",
				stderrPath: "/tmp/error.log",
				stdoutPath: "/tmp/output.log",
			})
		).toContain("/tmp/project&lt;one&gt;");
		const systemdUnit = createSystemdUnit({
			cliPath: '/tmp/$WRANGLER/wrangler"cli.js',
			nodePath: "/tmp/node",
			pathEnvironment: "/tmp/$PATH/100%",
			projectPath: "/tmp/$PROJECT",
		});
		expect(systemdUnit).toContain('/tmp/$$WRANGLER/wrangler\\"cli.js');
		expect(systemdUnit).toContain('WorkingDirectory="/tmp/$PROJECT"');
		expect(systemdUnit).toContain('Environment="PATH=/tmp/$PATH/100%%"');
	});
});
