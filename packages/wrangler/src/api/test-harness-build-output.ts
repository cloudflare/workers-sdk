import path from "node:path";
import {
	DEFAULT_WORKER_DIRECTORY_NAME,
	readBuildOutput,
} from "@cloudflare/build-output-utils";
import { convertToWranglerConfig } from "@cloudflare/config";
import {
	normalizeAndValidateConfig,
	UserError,
} from "@cloudflare/workers-utils";
import type {
	ModuleType,
	ParsedInputContainerConfig,
	ParsedOutputContainerConfig,
} from "@cloudflare/config";
import type { Config } from "@cloudflare/workers-utils";
import type { V4ModuleDefinition, V4ModuleRuleType } from "miniflare";

export type BuildOutputWorkerInput = {
	config: Config & { name: string };
	modules: V4ModuleDefinition[] | undefined;
	bundleDir: string | undefined;
	warnings: string | undefined;
};

/** Read the exact Worker scripts and settings emitted by the Build Output API. */
export async function readTestHarnessBuildOutput(
	root: string
): Promise<BuildOutputWorkerInput[]> {
	const absoluteRoot = path.resolve(root);
	const { workers, rootConfig, containers } =
		await readBuildOutput(absoluteRoot);
	const { buildContext: _buildContext, ...settings } = rootConfig;
	const configPath = path.join(absoluteRoot, "cloudflare.config.ts");
	const workerNames = [
		DEFAULT_WORKER_DIRECTORY_NAME,
		...Object.keys(workers).filter(
			(name) => name !== DEFAULT_WORKER_DIRECTORY_NAME
		),
	];

	return Promise.all(
		workerNames.map(async (workerName) => {
			const worker = workers[workerName];
			const { manifest, ...workerConfig } = worker.config;
			const rawConfig = convertToWranglerConfig({
				...settings,
				worker: workerConfig,
				containers: containers.map(({ config }) =>
					convertOutputContainerToInput(config)
				),
			});
			const { config, diagnostics } = normalizeAndValidateConfig(
				rawConfig,
				configPath,
				configPath,
				// Build Output contains image references rather than local build inputs.
				{ enableContainers: false },
				true
			);
			if (diagnostics.hasErrors()) {
				throw new UserError(diagnostics.renderErrors(), {
					telemetryMessage: "test harness build output validation failed",
				});
			}
			if (!config.name) {
				throw new UserError("Build Output Worker has no name.", {
					telemetryMessage: "test harness build output worker name missing",
				});
			}
			const normalizedWorkerName = config.name;

			if (worker.assetsDir) {
				config.assets = {
					...config.assets,
					directory: worker.assetsDir,
				};
			}

			let modules: V4ModuleDefinition[] | undefined;
			if (manifest && worker.bundleDir) {
				const bundleDir = worker.bundleDir;
				config.main = resolveBundleModulePath(bundleDir, manifest.mainModule);
				config.base_dir = bundleDir;
				config.no_bundle = true;
				config.find_additional_modules = false;
				config.build = { ...config.build, command: undefined };

				const main = manifest.modules[manifest.mainModule];
				if (!main) {
					throw new UserError(
						`Build Output main module ${JSON.stringify(manifest.mainModule)} is missing from the manifest.`,
						{
							telemetryMessage: "test harness build output main module missing",
						}
					);
				}
				const orderedModules = [
					[manifest.mainModule, main] as const,
					...Object.entries(manifest.modules).filter(
						([name]) => name !== manifest.mainModule
					),
				];
				modules = orderedModules.flatMap(([name, { type }]) => {
					resolveBundleModulePath(bundleDir, name);
					const moduleType = toMiniflareModuleType(type);
					return moduleType === undefined
						? []
						: [{ path: name, type: moduleType }];
				});
			}

			return {
				config: { ...config, name: normalizedWorkerName },
				modules,
				bundleDir: worker.bundleDir,
				warnings: diagnostics.hasWarnings()
					? diagnostics.renderWarnings()
					: undefined,
			};
		})
	);
}

function resolveBundleModulePath(bundleDir: string, name: string): string {
	const filePath = path.resolve(bundleDir, name);
	if (!filePath.startsWith(`${bundleDir}${path.sep}`)) {
		throw new UserError(`Invalid build output module path: ${name}`, {
			telemetryMessage: "test harness build output module path invalid",
		});
	}
	return filePath;
}

function toMiniflareModuleType(type: ModuleType): V4ModuleRuleType | undefined {
	switch (type) {
		case "esm":
			return "ESModule";
		case "cjs":
			return "CommonJS";
		case "wasm":
			return "CompiledWasm";
		case "text":
			return "Text";
		case "data":
		case "json":
			return "Data";
		case "python":
			return "PythonModule";
		case "python-requirement":
			return "PythonRequirement";
		case "sourcemap":
			return undefined;
	}
}

type OutputContainerImage = Extract<
	ParsedOutputContainerConfig,
	{ image: unknown }
>["image"];

function convertOutputContainerToInput(
	config: ParsedOutputContainerConfig
): ParsedInputContainerConfig {
	if (config.schedulingPolicy === "durable-object") {
		const { images: _images, ...container } = config;
		return container;
	}

	return {
		...config,
		image: {
			reference: convertOutputContainerImage(config.image),
		},
	};
}

function convertOutputContainerImage(image: OutputContainerImage): string {
	return "reference" in image ? image.reference : image.localReference;
}
