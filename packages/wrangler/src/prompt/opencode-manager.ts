import { Writable } from "node:stream";
import chalk from "chalk";
import { execa, execaCommandSync } from "execa";
import { UserError } from "../errors";
import { logger } from "../logger";
import { getPackageManager } from "../package-manager";
import type { PackageManager } from "../package-manager";

export async function detectOpencode(): Promise<boolean> {
	try {
		execaCommandSync("opencode --version", { stdio: "ignore" });
		return true;
	} catch {
		return false;
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
