import { Writable } from "node:stream";
import chalk from "chalk";
import { execa } from "execa";
import semiver from "semiver";
import { UserError } from "../errors";
import { logger } from "../logger";
import { getPackageManager } from "../package-manager";
import type { PackageManager } from "../package-manager";

export function isOpencodeVersionCompatible(version: string): boolean {
	return semiver(version.replace(/^v/, ""), "0.5.6") >= 0;
}

export async function detectOpencode(): Promise<string | null> {
	try {
		const res = await execa("opencode", ["--version"]);
		return res.stdout.trim();
	} catch {
		return null;
	}
}

export async function upgradeOpencode(): Promise<void> {
	logger.log("Upgrading opencode to latest version...");
	logger.log(chalk.dim("Running: opencode upgrade"));

	try {
		const res = execa("opencode", ["upgrade"]);

		res.stdout?.pipe(
			new Writable({
				write(chunk: Buffer, _, callback) {
					const lines = chunk.toString().split("\n");
					for (const line of lines) {
						if (line.trim()) {
							logger.log(chalk.blue("[opencode upgrade]"), line);
						}
					}
					callback();
				},
			})
		);

		res.stderr?.pipe(
			new Writable({
				write(chunk: Buffer, _, callback) {
					const lines = chunk.toString().split("\n");
					for (const line of lines) {
						if (line.trim()) {
							logger.log(chalk.red("[opencode upgrade]"), line);
						}
					}
					callback();
				},
			})
		);

		await res;

		logger.log("✨ Successfully upgraded opencode");
	} catch (e) {
		throw new UserError(
			"Failed to upgrade opencode. Please run 'opencode upgrade' manually.",
			{ cause: e }
		);
	}
}

export async function installOpencode(): Promise<void> {
	const packageManager = await getPackageManager();

	const { command, args } = getGlobalInstallCommand(
		packageManager.type,
		"opencode-ai@latest"
	);

	const installCommand = `${command} ${args.join(" ")}`;
	logger.log(`Installing opencode using ${packageManager.type}...`);
	logger.log(chalk.dim(`Running: ${installCommand}`));

	try {
		const res = execa(command, args);

		res.stdout?.pipe(
			new Writable({
				write(chunk: Buffer, _, callback) {
					const lines = chunk.toString().split("\n");
					for (const line of lines) {
						if (line.trim()) {
							logger.log(chalk.blue("[opencode install]"), line);
						}
					}
					callback();
				},
			})
		);

		res.stderr?.pipe(
			new Writable({
				write(chunk: Buffer, _, callback) {
					const lines = chunk.toString().split("\n");
					for (const line of lines) {
						if (line.trim()) {
							logger.log(chalk.red("[opencode install]"), line);
						}
					}
					callback();
				},
			})
		);

		await res;

		logger.log("✨ Successfully installed opencode");
	} catch (e) {
		throw new UserError(
			`Failed to install opencode. Please run '${installCommand}' manually.`,
			{ cause: e }
		);
	}
}

function getGlobalInstallCommand(
	packageManager: PackageManager["type"],
	packageName: string
): { command: string; args: string[] } {
	switch (packageManager) {
		case "npm":
			return { command: "npm", args: ["install", "-g", packageName] };
		case "yarn":
			return { command: "yarn", args: ["global", "add", packageName] };
		case "pnpm":
			return { command: "pnpm", args: ["add", "-g", packageName] };
		default:
			return { command: "npm", args: ["install", "-g", packageName] };
	}
}
