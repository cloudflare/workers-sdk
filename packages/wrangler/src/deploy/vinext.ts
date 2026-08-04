import assert from "node:assert";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { getInstalledPackageVersion } from "@cloudflare/autoconfig";
import { runCommand } from "@cloudflare/cli-shared-helpers/command";
import {
	getOpenNextDeployFromEnv,
	parseJSONC,
	UserError,
} from "@cloudflare/workers-utils";
import { logger } from "../logger";
import { getPackageManager } from "../package-manager";

const VINEXT_DEPLOY_ENV = "VINEXT_CLOUDFLARE_DEPLOY";

export function getVinextDeployFromEnv(): boolean {
	return process.env[VINEXT_DEPLOY_ENV] === "true";
}

export async function maybeDelegateToVinextDeployCommand(
	projectRoot: string,
	options: { skipBuild?: boolean } = {}
): Promise<boolean> {
	if (
		getVinextDeployFromEnv() ||
		getOpenNextDeployFromEnv() ||
		!(await isVinextProject(projectRoot))
	) {
		return false;
	}

	logger.log("vinext project detected, calling `@vinext/cloudflare deploy`");

	const deployArgIdx = process.argv.findIndex((arg) => arg === "deploy");
	assert(deployArgIdx !== -1, "Could not find `deploy` argument");
	const deployArguments = getVinextDeployArguments(
		process.argv.slice(deployArgIdx + 1)
	);
	if (options.skipBuild) {
		deployArguments.unshift("--skip-build");
	}
	const { npx } = await getPackageManager();

	await runCommand([npx, "vinext-cloudflare", "deploy", ...deployArguments], {
		env: {
			[VINEXT_DEPLOY_ENV]: "true",
		},
	});

	return true;
}

export function getVinextDeployArguments(args: string[]): string[] {
	const supportedArguments: string[] = [];

	for (let index = 0; index < args.length; index++) {
		const argument = args[index];
		if (argument === "--autoconfig" || argument === "--autoconfig=true") {
			continue;
		}

		const argumentWithValue = /^(--name|--env)=(.+)$/.exec(argument);
		if (argumentWithValue) {
			supportedArguments.push(argumentWithValue[1], argumentWithValue[2]);
			continue;
		}
		const shortEnvWithValue = /^-e=(.+)$/.exec(argument);
		if (shortEnvWithValue) {
			supportedArguments.push("--env", shortEnvWithValue[1]);
			continue;
		}

		if (["--name", "--env", "-e"].includes(argument)) {
			const value = args[++index];
			assert(value, `Expected a value after ${argument}`);
			supportedArguments.push(argument === "-e" ? "--env" : argument, value);
			continue;
		}

		throw new UserError(
			`The Wrangler option ${JSON.stringify(argument)} cannot be forwarded to vinext. Add the equivalent setting to wrangler.jsonc, then run \`wrangler deploy\` again.`,
			{ telemetryMessage: "vinext deploy option unsupported" }
		);
	}

	return supportedArguments;
}

async function isVinextProject(projectRoot: string): Promise<boolean> {
	try {
		const projectFiles = await readdir(projectRoot);
		const viteConfigFile = projectFiles.find((file) =>
			/^vite\.config\.(m|c)?(ts|js)$/.test(file)
		);
		if (!viteConfigFile) {
			return false;
		}

		const wranglerConfigFile = projectFiles.find((file) =>
			/^wrangler\.jsonc?$/.test(file)
		);
		if (!wranglerConfigFile) {
			return false;
		}
		const wranglerConfig = parseJSONC(
			await readFile(resolve(projectRoot, wranglerConfigFile), "utf8"),
			wranglerConfigFile
		) as {
			assets?: {
				binding?: string;
				directory?: string;
				not_found_handling?: string;
			};
		};
		if (
			wranglerConfig.assets?.binding !== "ASSETS" ||
			wranglerConfig.assets.directory !== "dist/client" ||
			wranglerConfig.assets.not_found_handling !== "none"
		) {
			return false;
		}

		return ["vinext", "@vinext/cloudflare"].every(
			(packageName) =>
				getInstalledPackageVersion(packageName, projectRoot, {
					stopAtProjectPath: true,
				}) !== undefined
		);
	} catch {
		return false;
	}
}
