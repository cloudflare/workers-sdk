import * as fs from "node:fs";
import * as path from "node:path";
import colors from "picocolors";
import * as wrangler from "wrangler";
import { createPlugin, satisfiesMinimumViteVersion } from "../utils";
import type { PluginContext } from "../context";

interface DeployConfig {
	configPath: string;
	auxiliaryWorkers?: Array<{ configPath: string }>;
}

/**
 * Compiles the just-built application into a standalone, self-hosted `workerd`
 * bundle (the Vite equivalent of `wrangler compile`). Reads the entry Worker's
 * generated `wrangler.json` from the build output and delegates to Wrangler's
 * shared compile implementation, so the two paths stay in sync.
 *
 * Must run after the build is fully finalized (deploy config + per-Worker
 * `wrangler.json` written), so it is invoked from the `buildApp` post hook
 * (Vite 7+) and from the end of `createBuildApp` (Vite 6) — guarded so it only
 * runs once per build.
 */
export async function emitStandaloneBuild(ctx: PluginContext): Promise<void> {
	const resolvedPluginConfig = ctx.resolvedPluginConfig;

	if (
		resolvedPluginConfig.type === "preview" ||
		resolvedPluginConfig.standalone === false
	) {
		return;
	}

	const root = ctx.resolvedViteConfig.root;
	const logger = ctx.resolvedViteConfig.logger;
	const deployConfigPath = path.resolve(
		root,
		".wrangler",
		"deploy",
		"config.json"
	);

	if (!fs.existsSync(deployConfigPath)) {
		logger.warn(
			colors.yellow(
				"[cloudflare] `standalone` build skipped: no build output was found."
			)
		);
		return;
	}

	const deployConfig = JSON.parse(
		fs.readFileSync(deployConfigPath, "utf-8")
	) as DeployConfig;
	const entryConfigPath = path.resolve(
		path.dirname(deployConfigPath),
		deployConfig.configPath
	);

	if (deployConfig.auxiliaryWorkers?.length) {
		logger.warn(
			colors.yellow(
				"[cloudflare] `standalone` currently compiles only the entry Worker; auxiliary Workers are not yet included in the bundle."
			)
		);
	}

	const outDir = path.resolve(root, resolvedPluginConfig.standalone.outDir);

	const result = await wrangler.unstable_compileStandalone({
		configPath: entryConfigPath,
		outDir,
		force: resolvedPluginConfig.standalone.force,
		log: false,
	});

	const relativeOutDir = path.relative(root, outDir) || ".";
	logger.info(
		`\n${colors.green("✦")} Standalone ${colors.bold("workerd")} bundle written to ${colors.dim(
			relativeOutDir
		)} (entry: ${result.entryService}).\n  Run it with ${colors.dim(
			`workerd serve config.capnp`
		)} from that directory, or build the generated Dockerfile.`
	);
}

/**
 * Plugin that emits the standalone bundle via the `buildApp` post hook
 * (Vite 7+). The Vite 6 path is handled by wrapping `builder.buildApp` in the
 * config plugin.
 */
export const standalonePlugin = createPlugin("standalone", (ctx) => {
	return {
		buildApp: {
			order: "post",
			async handler() {
				// In Vite 6 this hook does not run; `createBuildApp` invokes
				// `emitStandaloneBuild` instead.
				if (!satisfiesMinimumViteVersion("7.0.0")) {
					return;
				}
				await emitStandaloneBuild(ctx);
			},
		},
	};
});
