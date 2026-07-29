import { constants } from "node:fs";
import {
	access,
	mkdir,
	rename,
	stat,
	unlink,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {
	getGlobalConfigPath,
	removeDir,
	UserError,
} from "@cloudflare/workers-utils";
import { execa } from "execa";
import { logger } from "../logger";
import { getCodexMicroKeymapPath } from "./keymap";

const SERVICE_LABEL = "com.cloudflare.wrangler-codex-micro";
const SYSTEMD_SERVICE_NAME = "wrangler-codex-micro.service";
const UDEV_RULE_PATH = "/etc/udev/rules.d/70-wrangler-codex-micro.rules";
const UDEV_RULE = [
	"# Installed by wrangler --secret --install-codex-daemon",
	'KERNEL=="hidraw*", ATTRS{idVendor}=="303a", ATTRS{idProduct}=="8360", TAG+="uaccess", MODE="0660"',
	"",
].join("\n");

type SupportedPlatform = "darwin" | "linux";
type SystemCommand = "launchctl" | "sudo" | "systemctl";

interface CommandOptions {
	allowFailure?: boolean;
	inheritStdio?: boolean;
}

export type ExecuteSystemCommand = (
	command: SystemCommand,
	args: string[],
	options?: CommandOptions
) => Promise<number>;

export interface CodexMicroInstallOptions {
	cliPath: string;
	projectPath: string;
	configPath?: string;
	execute?: ExecuteSystemCommand;
	homePath?: string;
	nodePath?: string;
	platform?: NodeJS.Platform;
	uid?: number;
	pathEnvironment?: string;
}

export async function installCodexMicroDaemon(
	options: CodexMicroInstallOptions
): Promise<void> {
	const paths = resolveInstallPaths(options);
	await validateInstallOptions(paths);
	await mkdir(paths.configPath, { recursive: true });

	if (paths.platform === "darwin") {
		await installLaunchAgent(paths);
	} else {
		await installLinuxPermissions(paths);
		await installSystemdService(paths);
	}

	logger.log(`Codex Micro daemon installed for ${paths.projectPath}.`);
	logger.log(`Optional keymap: ${getCodexMicroKeymapPath(paths.homePath)}`);
	if (paths.platform === "darwin") {
		logger.log(`Logs: ${paths.stdoutPath} and ${paths.stderrPath}`);
		logger.log(
			"If the device cannot be opened, allow this Node executable in System Settings > Privacy & Security > Input Monitoring:",
			paths.nodePath
		);
	} else {
		logger.log(`Logs: journalctl --user -u ${SYSTEMD_SERVICE_NAME} -f`);
	}
}

export async function uninstallCodexMicroDaemon(
	options: Omit<CodexMicroInstallOptions, "cliPath" | "projectPath">
): Promise<void> {
	const paths = resolveInstallPaths({
		...options,
		cliPath: process.argv[1] ?? "",
		projectPath: process.cwd(),
	});

	if (paths.platform === "darwin") {
		await paths.execute("launchctl", ["bootout", paths.launchdServiceTarget], {
			allowFailure: true,
		});
		await unlink(paths.launchdPlistPath).catch(ignoreMissingFile);
	} else {
		await paths.execute(
			"systemctl",
			["--user", "disable", "--now", SYSTEMD_SERVICE_NAME],
			{ allowFailure: true }
		);
		await unlink(paths.systemdUnitPath).catch(ignoreMissingFile);
		await paths.execute("systemctl", ["--user", "daemon-reload"]);

		logger.log("Removing the Codex Micro Linux device permission rule.");
		await paths.execute("sudo", ["unlink", UDEV_RULE_PATH], {
			allowFailure: true,
			inheritStdio: true,
		});
		await paths.execute("sudo", ["udevadm", "control", "--reload-rules"], {
			inheritStdio: true,
		});
	}

	await removeDir(paths.configPath);
	logger.log("Codex Micro daemon uninstalled.");
}

export function createLaunchAgentPlist(options: {
	cliPath: string;
	nodePath: string;
	projectPath: string;
	stdoutPath: string;
	stderrPath: string;
	pathEnvironment: string;
}): string {
	const argumentsList = [
		options.nodePath,
		"--no-warnings",
		options.cliPath,
		"--secret",
		"--run-codex-daemon",
		"--cwd",
		options.projectPath,
	]
		.map((argument) => `      <string>${escapeXml(argument)}</string>`)
		.join("\n");

	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${SERVICE_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
${argumentsList}
    </array>
    <key>WorkingDirectory</key>
    <string>${escapeXml(options.projectPath)}</string>
    <key>EnvironmentVariables</key>
    <dict>
      <key>PATH</key>
      <string>${escapeXml(options.pathEnvironment)}</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ProcessType</key>
    <string>Background</string>
    <key>StandardOutPath</key>
    <string>${escapeXml(options.stdoutPath)}</string>
    <key>StandardErrorPath</key>
    <string>${escapeXml(options.stderrPath)}</string>
  </dict>
</plist>
`;
}

export function createSystemdUnit(options: {
	cliPath: string;
	nodePath: string;
	projectPath: string;
	pathEnvironment: string;
}): string {
	const argumentsList = [
		options.nodePath,
		"--no-warnings",
		options.cliPath,
		"--secret",
		"--run-codex-daemon",
		"--cwd",
		options.projectPath,
	]
		.map(quoteSystemdExecArgument)
		.join(" ");

	return `[Unit]
Description=Wrangler Codex Micro daemon

[Service]
Type=simple
ExecStart=${argumentsList}
WorkingDirectory=${quoteSystemdValue(options.projectPath)}
Environment=${quoteSystemdValue(`PATH=${options.pathEnvironment}`)}
Restart=always
RestartSec=2
KillMode=control-group

[Install]
WantedBy=default.target
`;
}

interface ResolvedInstallPaths {
	cliPath: string;
	configPath: string;
	execute: ExecuteSystemCommand;
	homePath: string;
	launchdDomain: string;
	launchdPlistPath: string;
	launchdServiceTarget: string;
	nodePath: string;
	pathEnvironment: string;
	platform: SupportedPlatform;
	projectPath: string;
	stderrPath: string;
	stdoutPath: string;
	systemdUnitPath: string;
}

function resolveInstallPaths(
	options: CodexMicroInstallOptions
): ResolvedInstallPaths {
	const platform = options.platform ?? process.platform;
	if (platform !== "darwin" && platform !== "linux") {
		throw new UserError(
			"The Codex Micro daemon only supports macOS and Linux.",
			{ telemetryMessage: "codex micro unsupported platform" }
		);
	}

	const homePath = path.resolve(options.homePath ?? os.homedir());
	const configPath = path.resolve(
		options.configPath ?? path.join(getGlobalConfigPath(), "codex-micro")
	);
	const uid = options.uid ?? process.getuid?.();
	if (platform === "darwin" && uid === undefined) {
		throw new UserError("Unable to determine the current macOS user ID.", {
			telemetryMessage: "codex micro user id unavailable",
		});
	}

	const launchdDomain = `gui/${uid ?? 0}`;
	const systemdConfigPath = path.resolve(
		// eslint-disable-next-line turbo/no-undeclared-env-vars -- XDG_CONFIG_HOME is a runtime OS setting, not a build input.
		process.env.XDG_CONFIG_HOME ?? path.join(homePath, ".config")
	);

	return {
		cliPath: path.resolve(options.cliPath),
		configPath,
		execute: options.execute ?? executeSystemCommand,
		homePath,
		launchdDomain,
		launchdPlistPath: path.join(
			homePath,
			"Library",
			"LaunchAgents",
			`${SERVICE_LABEL}.plist`
		),
		launchdServiceTarget: `${launchdDomain}/${SERVICE_LABEL}`,
		nodePath: path.resolve(options.nodePath ?? process.execPath),
		pathEnvironment:
			options.pathEnvironment ??
			process.env.PATH ??
			"/usr/local/bin:/usr/bin:/bin",
		platform,
		projectPath: path.resolve(options.projectPath),
		stderrPath: path.join(configPath, "daemon.error.log"),
		stdoutPath: path.join(configPath, "daemon.log"),
		systemdUnitPath: path.join(
			systemdConfigPath,
			"systemd",
			"user",
			SYSTEMD_SERVICE_NAME
		),
	};
}

async function validateInstallOptions(
	options: ResolvedInstallPaths
): Promise<void> {
	try {
		const [cli, node, project] = await Promise.all([
			stat(options.cliPath),
			stat(options.nodePath),
			stat(options.projectPath),
		]);
		if (!cli.isFile() || !node.isFile() || !project.isDirectory()) {
			throw new Error("Unexpected install path type.");
		}
		await Promise.all([
			access(options.cliPath, constants.R_OK),
			access(options.nodePath, constants.X_OK),
			access(options.projectPath, constants.R_OK | constants.X_OK),
		]);
	} catch (error) {
		throw new UserError(
			"Cannot install the Codex Micro daemon because its Node executable, Wrangler entrypoint, or project directory is inaccessible.",
			{
				telemetryMessage: "codex micro install path inaccessible",
				cause: error,
			}
		);
	}
}

async function installLaunchAgent(
	options: ResolvedInstallPaths
): Promise<void> {
	await mkdir(path.dirname(options.launchdPlistPath), { recursive: true });
	await writeFileAtomically(
		options.launchdPlistPath,
		createLaunchAgentPlist(options)
	);
	await options.execute(
		"launchctl",
		["bootout", options.launchdServiceTarget],
		{ allowFailure: true }
	);
	await options.execute("launchctl", [
		"bootstrap",
		options.launchdDomain,
		options.launchdPlistPath,
	]);
	await options.execute("launchctl", [
		"kickstart",
		"-k",
		options.launchdServiceTarget,
	]);
}

async function installLinuxPermissions(
	options: ResolvedInstallPaths
): Promise<void> {
	const stagedRulePath = path.join(options.configPath, "codex-micro.rules");
	await writeFileAtomically(stagedRulePath, UDEV_RULE);
	logger.log(
		"Installing the Codex Micro Linux device permission rule (sudo required)."
	);
	await options.execute(
		"sudo",
		["install", "-m", "0644", stagedRulePath, UDEV_RULE_PATH],
		{ inheritStdio: true }
	);
	await options.execute("sudo", ["udevadm", "control", "--reload-rules"], {
		inheritStdio: true,
	});
	await options.execute(
		"sudo",
		["udevadm", "trigger", "--subsystem-match=hidraw"],
		{ inheritStdio: true }
	);
}

async function installSystemdService(
	options: ResolvedInstallPaths
): Promise<void> {
	await mkdir(path.dirname(options.systemdUnitPath), { recursive: true });
	await writeFileAtomically(
		options.systemdUnitPath,
		createSystemdUnit(options)
	);
	await options.execute("systemctl", ["--user", "daemon-reload"]);
	await options.execute("systemctl", [
		"--user",
		"enable",
		"--now",
		SYSTEMD_SERVICE_NAME,
	]);
}

async function executeSystemCommand(
	command: SystemCommand,
	args: string[],
	options: CommandOptions = {}
): Promise<number> {
	const execaOptions = {
		reject: false,
		stdio: options.inheritStdio ? ("inherit" as const) : ("pipe" as const),
	};
	const result =
		command === "launchctl"
			? await execa("launchctl", args, execaOptions)
			: command === "systemctl"
				? await execa("systemctl", args, execaOptions)
				: await execa("sudo", args, execaOptions);

	if (result.exitCode !== 0 && !options.allowFailure) {
		throw new UserError(
			`Failed to configure the Codex Micro daemon with ${command}.`,
			{
				telemetryMessage: "codex micro service command failed",
			}
		);
	}
	return result.exitCode ?? 1;
}

async function writeFileAtomically(
	filePath: string,
	contents: string
): Promise<void> {
	const temporaryPath = `${filePath}.${process.pid}.tmp`;
	await writeFile(temporaryPath, contents, { mode: 0o600 });
	await rename(temporaryPath, filePath);
}

function escapeXml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

function quoteSystemdValue(value: string): string {
	if (value.includes("\n") || value.includes("\r")) {
		throw new UserError("Codex Micro service paths cannot contain newlines.", {
			telemetryMessage: "codex micro invalid service path",
		});
	}
	return `"${value
		.replaceAll("\\", "\\\\")
		.replaceAll('"', '\\"')
		.replaceAll("%", "%%")}"`;
}

function quoteSystemdExecArgument(value: string): string {
	return quoteSystemdValue(value.replaceAll("$", () => "$$"));
}

function ignoreMissingFile(error: unknown): void {
	if (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "ENOENT"
	) {
		return;
	}
	throw error;
}
