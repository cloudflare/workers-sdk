import { Writable } from "node:stream";
import chalk from "chalk";
import { execaCommand, execaCommandSync } from "execa";
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

	// Construct the global install command based on package manager
	const installCommand = getGlobalInstallCommand(
		packageManager.type,
		"opencode-ai@latest"
	);

	logger.log(`Installing opencode using ${packageManager.type}...`);
	logger.log(chalk.dim(`Running: ${installCommand}`));

	try {
		const res = execaCommand(installCommand);

		// Stream stdout with prefix
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

		// Stream stderr with red prefix
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
): string {
	switch (packageManager) {
		case "npm":
			return `npm install -g ${packageName}`;
		case "yarn":
			return `yarn global add ${packageName}`;
		case "pnpm":
			return `pnpm add -g ${packageName}`;
		default:
			return `npm install -g ${packageName}`;
	}
}
