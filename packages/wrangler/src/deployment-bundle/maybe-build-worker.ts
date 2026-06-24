import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { validateNodeCompatMode } from "@cloudflare/deploy-helpers";
import { logger } from "../logger";
import { isNavigatorDefined } from "../navigator-user-agent";
import { bundleWorker } from "./bundle";
import { logBuildOutput } from "./esbuild-plugins/log-build-output";
import {
	createModuleCollector,
	getWrangler1xLegacyModuleReferences,
} from "./module-collection";
import { noBundleWorker } from "./no-bundle-worker";
import { loadSourceMaps } from "./source-maps";
import type { WorkerBuildResult } from "@cloudflare/deploy-helpers";
import type {
	CfModule,
	Config,
	EphemeralDirectory,
	Entry,
} from "@cloudflare/workers-utils";

/**
 * The subset of merged config/args needed to build (bundle) a Worker.
 *
 * Building now happens separately from deploy/versions-upload, so these props
 * are passed only to `buildWorker` — not to `deploy()` / `versionsUpload()`.
 */
export type BuildProps = {
	/** Merged from args.script/config.main/config.site.entry-point/config.assets. */
	entry: Entry;
	/** Merged: --name arg ?? config.name, with CI override applied. Used for the outdir README. */
	name: string | undefined;
	/** Merged: --compatibility-date arg ?? config.compatibility_date. */
	compatibilityDate: string | undefined;
	/** Merged: --compatibility-flags arg ?? config.compatibility_flags. */
	compatibilityFlags: string[];
	/** Merged: --upload-source-maps arg ?? config.upload_source_maps. */
	uploadSourceMaps: boolean | undefined;
	/** Merged: --jsx-factory arg || config.jsx_factory. */
	jsxFactory: string;
	/** Merged: --jsx-fragment arg || config.jsx_fragment. */
	jsxFragment: string;
	/** Merged: --tsconfig arg ?? config.tsconfig. */
	tsconfig: string | undefined;
	/** Merged: --minify arg ?? config.minify. */
	minify: boolean | undefined;
	/** Merged: !(--bundle arg ?? !config.no_bundle). */
	noBundle: boolean;
	/** Merged: { ...config.define, ...--define arg }. CLI overrides config. */
	defines: Record<string, string>;
	/** Merged: { ...config.alias, ...--alias arg }. CLI overrides config. */
	alias: Record<string, string>;
	/** Output directory for the bundled Worker. From --outdir arg or a temp directory. */
	destination: string | EphemeralDirectory;
	/** From --outdir arg. Used for the outdir README and noBundleWorker. */
	outdir: string | undefined;
	/** From --metafile arg. Deploy-only; undefined for versions upload. */
	metafile: string | boolean | undefined;
};

export async function buildWorker(
	props: BuildProps,
	config: Config
): Promise<WorkerBuildResult> {
	const nodejsCompatMode = validateNodeCompatMode(
		props.compatibilityDate,
		props.compatibilityFlags,
		{ noBundle: props.noBundle }
	);

	if (props.noBundle && props.minify) {
		logger.warn(
			"`--minify` and `--no-bundle` can't be used together. If you want to minify your Worker and disable Wrangler's bundling, please minify as part of your own bundling process."
		);
	}
	const {
		entry,
		noBundle,
		destination,
		uploadSourceMaps,
		jsxFactory,
		jsxFragment,
		minify,
		compatibilityDate,
		compatibilityFlags,
	} = props;

	if (props.outdir) {
		// we're using a custom output directory,
		// so let's first ensure it exists
		mkdirSync(props.outdir, { recursive: true });
		const readmePath = path.join(props.outdir, "README.md");
		writeFileSync(
			readmePath,
			`This folder contains the built output assets for the worker "${props.name}" generated at ${new Date().toISOString()}.`
		);
	}

	if (noBundle) {
		// if we're not building, let's just copy the entry to the destination directory
		const destinationDir =
			typeof destination === "string" ? destination : destination.path;
		mkdirSync(destinationDir, { recursive: true });
		writeFileSync(
			path.join(destinationDir, path.basename(entry.file)),
			readFileSync(entry.file, "utf-8")
		);
	}

	const entryDirectory = path.dirname(entry.file);
	const moduleCollector = createModuleCollector({
		wrangler1xLegacyModuleReferences: getWrangler1xLegacyModuleReferences(
			entryDirectory,
			entry.file
		),
		entry,
		// `moduleCollector` doesn't get used when `noBundle` is set, so
		// `findAdditionalModules` always defaults to `false`
		findAdditionalModules: config.find_additional_modules ?? false,
		rules: config.rules ?? [],
		preserveFileNames: config.preserve_file_names ?? false,
	});

	const {
		modules,
		dependencies,
		resolvedEntryPointPath,
		bundleType,
		...bundle
	} = noBundle
		? await noBundleWorker(
				entry,
				config.rules ?? [],
				props.outdir,
				config.python_modules.exclude,
				config.find_additional_modules
			)
		: await bundleWorker(
				entry,
				typeof destination === "string" ? destination : destination.path,
				{
					metafile: props.metafile,
					bundle: true,
					additionalModules: [],
					moduleCollector,
					doBindings: config.durable_objects.bindings,
					workflowBindings: config.workflows ?? [],
					jsxFactory,
					jsxFragment,
					tsconfig: props.tsconfig,
					minify,
					keepNames: config.keep_names ?? true,
					sourcemap: uploadSourceMaps,
					nodejsCompatMode,
					compatibilityDate,
					compatibilityFlags,
					define: props.defines,
					checkFetch: false,
					alias: props.alias,
					// We want to know if the build is for development or publishing
					// This could potentially cause issues as we no longer have identical behaviour between dev and deploy?
					targetConsumer: "deploy",
					local: false,
					projectRoot: entry.projectRoot,
					defineNavigatorUserAgent: isNavigatorDefined(
						compatibilityDate,
						compatibilityFlags
					),
					plugins: [logBuildOutput(nodejsCompatMode)],

					// Pages specific options used by wrangler pages commands
					entryName: undefined,
					inject: undefined,
					isOutfile: undefined,
					external: undefined,

					// These options are dev-only
					testScheduled: undefined,
					watch: undefined,
				}
			);

	// Add modules to dependencies for size warning
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
	const main: CfModule = {
		name: path.basename(resolvedEntryPointPath),
		filePath: resolvedEntryPointPath,
		content,
		type: bundleType,
	};
	const sourceMaps = uploadSourceMaps
		? loadSourceMaps(main, modules, bundle)
		: undefined;

	return {
		modules,
		sourceMaps,
		dependencies,
		resolvedEntryPointPath,
		bundleType,
		content,
	};
}
