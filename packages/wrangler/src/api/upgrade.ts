import { writeFileSync, existsSync } from "fs";
import path from "path";
import { execaSync } from "execa";
import { fetch } from "undici";
import { findWranglerToml } from "../config";
import { confirm } from "../dialogs";
import { printWranglerBanner } from "../index";
import { logger } from "../logger";
import { readFileSync } from "../parse";

import type { PackageJSON } from "../parse";

export async function upgradeWrangler({
	yesFlag = false,
}: {
	yesFlag: boolean;
}) {
	await printWranglerBanner();
	let packageJsonData: undefined | PackageJSON;

	const pathToWorker = findWranglerToml();
	if (pathToWorker) {
		const newPath = pathToWorker.split(path.sep).slice(0, -1).join(path.sep);
		packageJsonData = JSON.parse(
			readFileSync(`${newPath}/package.json`)
		) as PackageJSON;

		if (packageJsonData.devDependencies?.wrangler) {
			try {
				const wranglerDistTags = (
					(await (
						await fetch("https://registry.npmjs.org/wrangler")
					).json()) as {
						"dist-tags": { latest: string };
					}
				)["dist-tags"];
				const latestVersion = wranglerDistTags.latest;

				const currentVersion = packageJsonData.devDependencies
					.wrangler as string;
				logger.log(
					`Attempting to upgrade Wrangler from ${currentVersion} to the latest version ${latestVersion}...`
				);

				if (
					latestVersion.split(".")[0] !== currentVersion.split(".")[0] &&
					!yesFlag
				) {
					const userDecision = await confirm(
						`⚠️  A major semver change has been detected. Would you like to continue?`
					);
					if (userDecision === false) {
						return;
					}
				}

				packageJsonData.devDependencies.wrangler = latestVersion;
				writeFileSync(
					`${newPath}/package.json`,
					JSON.stringify(packageJsonData, null, 2),
					"utf8"
				);

				const packageLockFile = "package-lock.json";
				const yarnLockFile = "yarn.lock";
				const pnpmLockFile = "pnpm-lock.yaml";

				if (existsSync(packageLockFile)) {
					logger.info("🔧 Updating package-lock.json & node_modules");
					execaSync("npm", ["install"]);
				} else if (existsSync(yarnLockFile)) {
					logger.info("🔧 Updating yarn.lock & node_modules");
					execaSync("yarn", ["install"]);
				} else if (existsSync(pnpmLockFile)) {
					logger.info("🔧 Updating pnpm-lock.yaml & node_modules");
					execaSync("pnpm", ["install"]);
				} else {
					logger.error(
						"🚨 No lockfile found, unable to determine package manager."
					);
				}
				logger.log("✨ Wrangler upgrade complete! 🎉");
			} catch (error) {
				throw Error(`Wrangler upgrade failed: ${error}`);
			}
		} else {
			logger.error("🚨 Unable to locate Wrangler in project package.json");
		}
	} else {
		logger.error(
			"🚨 Wrangler failed to find a Worker project in the current directory."
		);
	}
}
