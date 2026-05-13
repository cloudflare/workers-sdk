import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isNavigatorDefined } from "../navigator-user-agent";
import { bundleWorker } from "./bundle";
import { printBundleSize } from "./bundle-reporter";
import { logBuildOutput } from "./esbuild-plugins/log-build-output";
import {
	createModuleCollector,
	getWrangler1xLegacyModuleReferences,
} from "./module-collection";
import { noBundleWorker } from "./no-bundle-worker";
import type { BundleResult } from "./bundle";
import type { DeployProps, VersionsUploadProps } from "./resolve-input";
import type { CfModule, CfModuleType, Config } from "@cloudflare/workers-utils";

/**
 * The build outputs needed to construct a CfWorkerInit and handle upload errors.
 */
export type BuildResult = {
	main: CfModule;
	modules: CfModule[];
	dependencies: Record<string, { bytesInOutput: number }>;
	bundleType: CfModuleType;
	resolvedEntryPointPath: string;
	entryPointName: string;
	bundle: Partial<BundleResult>;
};

/**
 * Builds (or no-bundles) the worker entry point and returns a BuildResult.
 *
 * Shared between `wrangler deploy` and `wrangler versions upload`.
 * Does NOT apply to preview or versions secret — those have different data sources.
 */
export async function buildWorker(
	props: DeployProps | VersionsUploadProps,
	config: Config
): Promise<BuildResult> {
	if (props.outdir) {
		mkdirSync(props.outdir, { recursive: true });
		const readmePath = path.join(props.outdir, "README.md");
		writeFileSync(
			readmePath,
			`This folder contains the built output assets for the worker "${props.name}" generated at ${new Date().toISOString()}.`
		);
	}
	if (props.noBundle) {
		const destinationDir =
			typeof props.destination === "string"
				? props.destination
				: props.destination.path;
		mkdirSync(destinationDir, { recursive: true });
		writeFileSync(
			path.join(destinationDir, path.basename(props.entry.file)),
			readFileSync(props.entry.file, "utf-8")
		);
	}

	const entryDirectory = path.dirname(props.entry.file);
	const moduleCollector = createModuleCollector({
		wrangler1xLegacyModuleReferences: getWrangler1xLegacyModuleReferences(
			entryDirectory,
			props.entry.file
		),
		entry: props.entry,
		findAdditionalModules: config.find_additional_modules ?? false,
		rules: props.rules,
		preserveFileNames: config.preserve_file_names ?? false,
	});

	const {
		modules,
		dependencies,
		resolvedEntryPointPath,
		bundleType,
		...bundle
	} = props.noBundle
		? await noBundleWorker(
				props.entry,
				props.rules,
				props.outdir,
				config.python_modules.exclude
			)
		: await bundleWorker(
				props.entry,
				typeof props.destination === "string"
					? props.destination
					: props.destination.path,
				{
					metafile: props.command === "deploy" ? props.metafile : undefined,
					bundle: true,
					additionalModules: [],
					moduleCollector,
					doBindings: config.durable_objects.bindings,
					workflowBindings: config.workflows,
					jsxFactory: props.jsxFactory,
					jsxFragment: props.jsxFragment,
					tsconfig: props.tsconfig,
					minify: props.minify,
					keepNames: config.keep_names ?? true,
					sourcemap: props.uploadSourceMaps,
					nodejsCompatMode: props.nodejsCompatMode,
					compatibilityDate: props.compatibilityDate,
					compatibilityFlags: props.compatibilityFlags,
					define: props.defines,
					alias: props.alias,
					checkFetch: false,
					targetConsumer: "deploy",
					local: false,
					projectRoot: props.entry.projectRoot,
					defineNavigatorUserAgent: isNavigatorDefined(
						props.compatibilityDate,
						props.compatibilityFlags
					),
					plugins: [logBuildOutput(props.nodejsCompatMode)],
					entryName: undefined,
					inject: undefined,
					isOutfile: undefined,
					external: undefined,
					testScheduled: undefined,
					watch: undefined,
				}
			);

	for (const module of modules) {
		const modulePath =
			module.filePath === undefined
				? module.name
				: path.relative("", module.filePath);
		const bytesInOutput =
			typeof module.content === "string"
				? Buffer.byteLength(module.content)
				: module.content.byteLength;
		dependencies[modulePath] = { bytesInOutput };
	}

	const content = readFileSync(resolvedEntryPointPath, {
		encoding: "utf-8",
	});

	const entryPointName = path.basename(resolvedEntryPointPath);
	const main: CfModule = {
		name: entryPointName,
		filePath: resolvedEntryPointPath,
		content,
		type: bundleType,
	};

	await printBundleSize({ name: entryPointName, content }, modules);

	return {
		main,
		modules,
		dependencies,
		bundleType,
		resolvedEntryPointPath,
		entryPointName,
		bundle,
	};
}
