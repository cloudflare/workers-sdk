import { existsSync, rmSync } from "fs";
import path from "path";
import { brandColor, dim } from "@cloudflare/cli/colors";
import semver from "semver";
import whichPmRuns from "which-pm-runs";
import {
	testPackageManager,
	testPackageManagerVersion,
} from "../../e2e/helpers/constants";
import { runCommand } from "./command";
import type { C3Context } from "types";

/**
 * Detects the package manager which was used to invoke C3 and provides a map of its associated commands.
 *
 * @returns
 * An object containing entries for the following operations:
 * - npm: running commands with the package manager (ex. `npm install` or `npm run build`)
 * - npx: executing code local to the working directory (ex. `npx wrangler whoami`)
 * - dlx: executing packages that are not installed locally (ex. `pnpm dlx create-solid`)
 */
export const detectPackageManager = () => {
	const pmInfo = whichPmRuns();

	let { name, version } = pmInfo ?? { name: "npm", version: "0.0.0" };

	if (testPackageManager && testPackageManagerVersion) {
		name = testPackageManager;
		version = testPackageManagerVersion;
		process.env.npm_config_user_agent = `${name}/${version}`;
	}

	switch (name) {
		case "pnpm":
			if (semver.gt(version, "6.0.0")) {
				return {
					name,
					version,
					npm: "pnpm",
					npx: "pnpm",
					dlx: ["pnpm", "dlx"],
				};
			}
			return {
				name,
				version,
				npm: "pnpm",
				npx: "pnpx",
				dlx: ["pnpx"],
			};
		case "yarn":
			if (semver.gt(version, "2.0.0")) {
				return {
					name,
					version,
					npm: "yarn",
					npx: "yarn",
					dlx: ["yarn", "dlx"],
				};
			}
			return {
				name,
				version,
				npm: "yarn",
				npx: "yarn",
				dlx: ["yarn"],
			};
		case "bun":
			return {
				name,
				version,
				npm: "bun",
				npx: "bunx",
				dlx: ["bunx"],
			};

		case "npm":
		default:
			return {
				name,
				version,
				npm: "npm",
				npx: "npx",
				dlx: ["npx"],
			};
	}
};

/**
 * If a mismatch is detected between the package manager being used and the lockfiles on disk,
 * reset the state by deleting the lockfile and dependencies then re-installing with the package
 * manager used by the calling process.
 *
 * This is needed since some scaffolding tools don't detect and use the pm of the calling process,
 * and instead always use `npm`. With a project in this state, installing additional dependencies
 * with `pnpm` or `yarn` can result in install errors.
 *
 */
export const rectifyPmMismatch = async (ctx: C3Context) => {
	const { npm } = detectPackageManager();

	if (!detectPmMismatch(ctx)) {
		return;
	}

	const nodeModulesPath = path.join(ctx.project.path, "node_modules");
	if (existsSync(nodeModulesPath)) {
		rmSync(nodeModulesPath, { recursive: true });
	}

	const lockfilePath = path.join(ctx.project.path, "package-lock.json");
	if (existsSync(lockfilePath)) {
		rmSync(lockfilePath);
	}

	await runCommand([npm, "install"], {
		silent: true,
		cwd: ctx.project.path,
		startText: "Installing dependencies",
		doneText: `${brandColor("installed")} ${dim(`via \`${npm} install\``)}`,
	});
};

export const detectPmMismatch = (ctx: C3Context) => {
	const { npm } = detectPackageManager();
	const projectPath = ctx.project.path;

	switch (npm) {
		case "npm":
			return false;
		case "yarn":
			return !existsSync(path.join(projectPath, "yarn.lock"));
		case "pnpm":
			return !existsSync(path.join(projectPath, "pnpm-lock.yaml"));
		case "bun":
			return (
				!existsSync(path.join(projectPath, "bun.lockb")) &&
				!existsSync(path.join(projectPath, "bun.lock"))
			);
	}
};
