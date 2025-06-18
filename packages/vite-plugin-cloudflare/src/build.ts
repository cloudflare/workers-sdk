import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import colors from "picocolors";
import type {
	AssetsOnlyResolvedConfig,
	WorkersResolvedConfig,
} from "./plugin-config";
import type * as vite from "vite";
import type { Unstable_Config } from "wrangler";

export function createBuildApp(
	resolvedPluginConfig: AssetsOnlyResolvedConfig | WorkersResolvedConfig
): (builder: vite.ViteBuilder) => Promise<void> {
	return async (builder) => {
		const clientEnvironment = builder.environments.client;
		assert(clientEnvironment, `No "client" environment`);
		const defaultHtmlPath = path.resolve(builder.config.root, "index.html");
		const hasClientEntry =
			clientEnvironment.config.build.rollupOptions.input ||
			fs.existsSync(defaultHtmlPath);

		if (resolvedPluginConfig.type === "assets-only") {
			if (hasClientEntry) {
				await builder.build(clientEnvironment);
			} else if (getHasPublicAssets(builder.config)) {
				await fallbackBuild(builder, clientEnvironment);
			}

			// Return early as there are no Workers to build
			return;
		}

		const workerEnvironments = Object.keys(resolvedPluginConfig.workers).map(
			(environmentName) => {
				const environment = builder.environments[environmentName];
				assert(environment, `"${environmentName}" environment not found`);

				return environment;
			}
		);

		await Promise.all(
			workerEnvironments.map((environment) => builder.build(environment))
		);

		const { entryWorkerEnvironmentName } = resolvedPluginConfig;
		const entryWorkerEnvironment =
			builder.environments[entryWorkerEnvironmentName];
		assert(
			entryWorkerEnvironment,
			`No "${entryWorkerEnvironmentName}" environment`
		);
		const entryWorkerBuildDirectory = path.resolve(
			builder.config.root,
			entryWorkerEnvironment.config.build.outDir
		);
		const entryWorkerManifest = loadViteManifest(entryWorkerBuildDirectory);
		const importedAssetPaths = getImportedAssetPaths(entryWorkerManifest);

		if (hasClientEntry) {
			await builder.build(clientEnvironment);
		} else if (importedAssetPaths.size || getHasPublicAssets(builder.config)) {
			await fallbackBuild(builder, clientEnvironment);
		} else {
			const entryWorkerConfigPath = path.join(
				entryWorkerBuildDirectory,
				"wrangler.json"
			);
			const workerConfig = JSON.parse(
				fs.readFileSync(entryWorkerConfigPath, "utf-8")
			) as Unstable_Config;
			// Remove `assets` field as there are no assets
			workerConfig.assets = undefined;
			fs.writeFileSync(entryWorkerConfigPath, JSON.stringify(workerConfig));

			// Return early as there is no client build
			return;
		}

		const clientBuildDirectory = path.resolve(
			builder.config.root,
			clientEnvironment.config.build.outDir
		);
		const movedAssetPaths: string[] = [];

		// Move assets imported in the entry Worker to the client build
		for (const assetPath of importedAssetPaths) {
			const src = path.join(entryWorkerBuildDirectory, assetPath);
			const dest = path.join(clientBuildDirectory, assetPath);

			if (!fs.existsSync(src)) {
				continue;
			}

			if (fs.existsSync(dest)) {
				fs.unlinkSync(src);
			} else {
				const destDir = path.dirname(dest);
				fs.mkdirSync(destDir, { recursive: true });
				fs.renameSync(src, dest);
				movedAssetPaths.push(dest);
			}
		}

		if (movedAssetPaths.length) {
			builder.config.logger.info(
				[
					`${colors.green("✓")} ${movedAssetPaths.length} asset${movedAssetPaths.length > 1 ? "s" : ""} moved from "${entryWorkerEnvironmentName}" to "client" build output.`,
					...movedAssetPaths.map((assetPath) =>
						colors.dim(path.relative(builder.config.root, assetPath))
					),
				].join("\n")
			);
		}
	};
}

function getHasPublicAssets({ publicDir }: vite.ResolvedConfig): boolean {
	let hasPublicAssets = false;

	if (publicDir) {
		try {
			const files = fs.readdirSync(publicDir);

			if (files.length) {
				hasPublicAssets = true;
			}
		} catch (error) {}
	}

	return hasPublicAssets;
}

async function fallbackBuild(
	builder: vite.ViteBuilder,
	environment: vite.BuildEnvironment
): Promise<void> {
	const fallbackEntryName = "__cloudflare_fallback_entry__";

	environment.config.build.rollupOptions = {
		input: "virtual:__cloudflare_fallback_entry__",
		logLevel: "silent",
		output: {
			entryFileNames: fallbackEntryName,
		},
	};

	await builder.build(environment);

	const fallbackEntryPath = path.resolve(
		builder.config.root,
		environment.config.build.outDir,
		fallbackEntryName
	);

	fs.unlinkSync(fallbackEntryPath);
}

function loadViteManifest(directory: string) {
	const contents = fs.readFileSync(
		path.resolve(directory, ".vite", "manifest.json"),
		"utf-8"
	);

	return JSON.parse(contents) as vite.Manifest;
}

function getImportedAssetPaths(viteManifest: vite.Manifest): Set<string> {
	const assetPaths = Object.values(viteManifest).flatMap(
		(chunk) => chunk.assets ?? []
	);

	return new Set(assetPaths);
}
