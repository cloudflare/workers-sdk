import { existsSync } from "fs";
import path from "path";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { runCommand } from "./command";
import { detectPackageManager } from "./packageManagers";
import type { C3Context } from "types";

type InstallConfig = {
	startText?: string;
	doneText?: string;
	dev?: boolean;
};

export const installPackages = async (
	packages: string[],
	config: InstallConfig = {}
) => {
	const { npm } = detectPackageManager();

	let saveFlag;
	let cmd;
	switch (npm) {
		case "yarn":
			cmd = "add";
			saveFlag = config.dev ? "-D" : "";
			break;
		case "bun":
			cmd = "add";
			saveFlag = config.dev ? "-d" : "";
			break;
		case "npm":
		case "pnpm":
		default:
			cmd = "install";
			saveFlag = config.dev ? "--save-dev" : "--save";
			break;
	}

	await runCommand([npm, cmd, ...(saveFlag ? [saveFlag] : []), ...packages], {
		...config,
		silent: true,
	});
};

export const npmInstall = async (ctx: C3Context) => {
	// Skip this step if packages have already been installed
	const nodeModulesPath = path.join(ctx.project.path, "node_modules");
	if (existsSync(nodeModulesPath)) {
		return;
	}

	const { npm } = detectPackageManager();

	await runCommand([npm, "install"], {
		silent: true,
		startText: "Installing dependencies",
		doneText: `${brandColor("installed")} ${dim(`via \`${npm} install\``)}`,
	});
};
