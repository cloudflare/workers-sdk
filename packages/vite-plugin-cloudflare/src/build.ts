import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import colors from "picocolors";
import { VIRTUAL_CLIENT_FALLBACK_ENTRY } from "./plugins/virtual-modules";
import { satisfiesViteVersion } from "./utils";
import type {
	AssetsOnlyResolvedConfig,
	WorkersResolvedConfig,
} from "./plugin-config";
import type * as vite from "vite";
import type { Unstable_Config } from "wrangler";

const CLIENT_FALLBACK_ENTRY_NAME = "__cloudflare_fallback_entry__";

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

		const workerEnvironments = [
			...resolvedPluginConfig.environmentNameToWorkerMap.keys(),
		].map((environmentName) => {
			const environment = builder.environments[environmentName];
			assert(environment, `"${environmentName}" environment not found`);

			return environment;
		});

		await Promise.all(
			workerEnvironments.map((environment) => builder.build(environment))
		);

		if (resolvedPluginConfig.type === "assets-only") {
			if (hasClientEntry) {
				await builder.build(clientEnvironment);
			} else if (
				getHasPublicAssets(builder.config) ||
				resolvedPluginConfig.prerenderWorkerEnvironmentName
			) {
				await fallbackBuild(builder, clientEnvironment);
			}

			return;
		}

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
		} else if (
			importedAssetPaths.size ||
			getHasPublicAssets(builder.config) ||
			resolvedPluginConfig.prerenderWorkerEnvironmentName
		) {
			await fallbackBuild(builder, clientEnvironment);
		} else {
			// In Vite 7 and above we do this in the `buildApp` hook
			if (!satisfiesViteVersion("7.0.0")) {
				removeAssetsField(entryWorkerBuildDirectory);
			}

			// Return early as there is no client build
			return;
		}

		// TODO: move static assets from the prerender environment to the client environment

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
		} catch {}
	}

	return hasPublicAssets;
}

async function fallbackBuild(
	builder: vite.ViteBuilder,
	environment: vite.BuildEnvironment
): Promise<void> {
	environment.config.build.rollupOptions = {
		input: VIRTUAL_CLIENT_FALLBACK_ENTRY,
		logLevel: "silent",
		output: {
			entryFileNames: CLIENT_FALLBACK_ENTRY_NAME,
		},
	};

	await builder.build(environment);

	const fallbackEntryPath = path.resolve(
		builder.config.root,
		environment.config.build.outDir,
		CLIENT_FALLBACK_ENTRY_NAME
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

/**
 * Used to remove the `assets` field from the entry Worker config if there are no assets
 */
export function removeAssetsField(entryWorkerBuildDirectory: string): void {
	const entryWorkerConfigPath = path.join(
		entryWorkerBuildDirectory,
		"wrangler.json"
	);
	const workerConfig = JSON.parse(
		fs.readFileSync(entryWorkerConfigPath, "utf-8")
	) as Unstable_Config;

	workerConfig.assets = undefined;

	fs.writeFileSync(entryWorkerConfigPath, JSON.stringify(workerConfig));
}
