import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import colors from "picocolors";
import { resolveDevOnly } from "./plugin-config";
import { VIRTUAL_CLIENT_FALLBACK_ENTRY } from "./plugins/virtual-modules";
import type {
	AssetsOnlyResolvedConfig,
	WorkersResolvedConfig,
} from "./plugin-config";
import type * as vite from "vite";
import type { Unstable_Config } from "wrangler";

const CLIENT_FALLBACK_ENTRY_NAME = "__cloudflare_fallback_entry__";

/** Build the remaining Worker and client environments and transfer imported assets. */
export async function buildApp(
	builder: vite.ViteBuilder,
	resolvedPluginConfig: AssetsOnlyResolvedConfig | WorkersResolvedConfig,
	environmentNameToImportedAssetPaths: ReadonlyMap<string, ReadonlySet<string>>
): Promise<void> {
	const clientEnvironment = builder.environments.client;
	assert(clientEnvironment, `No "client" environment`);
	const defaultHtmlPath = path.resolve(builder.config.root, "index.html");
	const hasClientEntry =
		/* eslint-disable-next-line @typescript-eslint/no-deprecated --
				We use `rollupOptions` for backward compatibility with Vite 6 and 7, where `rolldownOptions` does not exist.
				In Vite 8, `rollupOptions` is aliased to `rolldownOptions` so this works across all supported versions. */
		clientEnvironment.config.build.rollupOptions.input ||
		fs.existsSync(defaultHtmlPath);

	const workerEnvironments = [
		...resolvedPluginConfig.environmentNameToWorkerMap.entries(),
	]
		.filter(([_, worker]) => !resolveDevOnly(worker.devOnly))
		.map(([environmentName]) => {
			const environment = builder.environments[environmentName];
			assert(environment, `"${environmentName}" environment not found`);

			return environment;
		});

	await Promise.all(
		workerEnvironments
			.filter((environment) => !environment.isBuilt)
			.map((environment) => builder.build(environment))
	);

	const assetEnvironments = workerEnvironments
		.filter(
			(environment) =>
				environment.name ===
					resolvedPluginConfig.prerenderWorkerEnvironmentName ||
				(resolvedPluginConfig.type === "workers" &&
					environment.name === resolvedPluginConfig.entryWorkerEnvironmentName)
		)
		.flatMap((environment) => {
			const childEnvironmentNames =
				resolvedPluginConfig.environmentNameToChildEnvironmentNamesMap.get(
					environment.name
				) ?? [];
			const childEnvironments = childEnvironmentNames
				.map((name) => {
					const childEnvironment = builder.environments[name];
					assert(childEnvironment, `"${name}" environment not found`);
					return childEnvironment;
				})
				.filter((childEnvironment) => childEnvironment.isBuilt);
			return [environment, ...childEnvironments].map((assetEnvironment) => ({
				environment: assetEnvironment,
				// TODO: Move all assets again once upstream Astro changes no longer
				// require the originals in prerender build output.
				preserveOriginalAssets:
					environment.name ===
					resolvedPluginConfig.prerenderWorkerEnvironmentName,
			}));
		});

	// Vite 6 does not set `isBuilt`, so also track the client build done here
	let isClientBuilt = clientEnvironment.isBuilt;
	if (!isClientBuilt) {
		if (hasClientEntry) {
			await builder.build(clientEnvironment);
			isClientBuilt = true;
		} else if (
			assetEnvironments.some(
				({ environment }) =>
					environmentNameToImportedAssetPaths.get(environment.name)?.size
			) ||
			getHasPublicAssets(builder.config) ||
			resolvedPluginConfig.prerenderWorkerEnvironmentName
		) {
			await fallbackBuild(builder, clientEnvironment);
			isClientBuilt = true;
		}
	}

	if (!isClientBuilt) {
		if (
			resolvedPluginConfig.type === "workers" &&
			workerEnvironments.some(
				(environment) =>
					environment.name === resolvedPluginConfig.entryWorkerEnvironmentName
			)
		) {
			const entry =
				builder.environments[resolvedPluginConfig.entryWorkerEnvironmentName];
			assert(entry);
			removeAssetsField(
				path.resolve(builder.config.root, entry.config.build.outDir)
			);
		}
		return;
	}

	const clientBuildDirectory = path.resolve(
		builder.config.root,
		clientEnvironment.config.build.outDir
	);

	for (const { environment, preserveOriginalAssets } of assetEnvironments) {
		const importedAssetPaths = environmentNameToImportedAssetPaths.get(
			environment.name
		);
		if (!importedAssetPaths?.size) {
			continue;
		}
		const workerBuildDirectory = path.resolve(
			builder.config.root,
			environment.config.build.outDir
		);
		const transferredAssetPaths: string[] = [];

		for (const assetPath of importedAssetPaths) {
			const src = path.join(workerBuildDirectory, assetPath);
			const dest = path.join(clientBuildDirectory, assetPath);

			if (!fs.existsSync(src)) {
				continue;
			}

			if (fs.existsSync(dest)) {
				if (!preserveOriginalAssets) {
					fs.unlinkSync(src);
				}
			} else {
				const destDir = path.dirname(dest);
				fs.mkdirSync(destDir, { recursive: true });
				if (preserveOriginalAssets) {
					fs.copyFileSync(src, dest);
				} else {
					fs.renameSync(src, dest);
				}
				transferredAssetPaths.push(dest);
			}
		}

		if (transferredAssetPaths.length) {
			builder.config.logger.info(
				[
					`${colors.green("✓")} ${transferredAssetPaths.length} asset${
						transferredAssetPaths.length > 1 ? "s" : ""
					} ${preserveOriginalAssets ? "copied" : "moved"} from "${environment.name}" to "client" build output.`,
					...transferredAssetPaths.map((assetPath) =>
						colors.dim(path.relative(builder.config.root, assetPath))
					),
				].join("\n")
			);
		}
	}
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
	/* eslint-disable-next-line @typescript-eslint/no-deprecated --
		We use `rollupOptions` for backward compatibility with Vite 6 and 7, where `rolldownOptions` does not exist.
		In Vite 8, `rollupOptions` is aliased to `rolldownOptions` so this works across all supported versions. */
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
