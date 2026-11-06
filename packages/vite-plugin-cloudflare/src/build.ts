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

const CLIENT_FALLBACK_ENTRY_NAME = "__cloudflare_fallback_entry__";

/** Build the remaining Worker and client environments and move imported assets. */
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
				We use `rollupOptions` for backward compatibility with Vite 7, where `rolldownOptions` does not exist.
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
			return [environment, ...childEnvironments];
		});

	if (!clientEnvironment.isBuilt) {
		if (hasClientEntry) {
			await builder.build(clientEnvironment);
		} else if (
			assetEnvironments.some(
				(environment) =>
					environmentNameToImportedAssetPaths.get(environment.name)?.size
			) ||
			getHasPublicAssets(builder.config) ||
			resolvedPluginConfig.prerenderWorkerEnvironmentName
		) {
			await fallbackBuild(builder, clientEnvironment);
		}
	}

	if (!clientEnvironment.isBuilt) {
		return;
	}

	const clientBuildDirectory = path.resolve(
		builder.config.root,
		clientEnvironment.config.build.outDir
	);

	for (const environment of assetEnvironments) {
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
		const movedAssetPaths: string[] = [];

		for (const assetPath of importedAssetPaths) {
			const src = path.join(workerBuildDirectory, assetPath);
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
					`${colors.green("✓")} ${movedAssetPaths.length} asset${
						movedAssetPaths.length > 1 ? "s" : ""
					} moved from "${environment.name}" to "client" build output.`,
					...movedAssetPaths.map((assetPath) =>
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
		We use `rollupOptions` for backward compatibility with Vite 7, where `rolldownOptions` does not exist.
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
