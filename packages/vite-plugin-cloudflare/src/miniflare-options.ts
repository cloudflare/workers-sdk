import assert from 'node:assert';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Log, LogLevel, Response as MiniflareResponse } from 'miniflare';
import * as vite from 'vite';
import {
	unstable_getMiniflareWorkerOptions,
	unstable_readConfig,
} from 'wrangler';
import {
	ASSET_WORKER_NAME,
	ASSET_WORKERS_COMPATIBILITY_DATE,
	ROUTER_WORKER_NAME,
} from './assets';
import type { CloudflareDevEnvironment } from './cloudflare-environment';
import type {
	PersistState,
	ResolvedPluginConfig,
	WorkerConfig,
} from './plugin-config';
import type { MiniflareOptions, SharedOptions, WorkerOptions } from 'miniflare';
import type { FetchFunctionOptions } from 'vite/module-runner';

type PersistOptions = Pick<
	SharedOptions,
	| 'cachePersist'
	| 'd1Persist'
	| 'durableObjectsPersist'
	| 'kvPersist'
	| 'r2Persist'
>;

function getPersistence(
	root: string,
	persistState: PersistState,
): PersistOptions {
	if (persistState === false) {
		return {};
	}

	const defaultPersistPath = '.wrangler/state';
	const persistPath = path.resolve(
		root,
		typeof persistState === 'object' ? persistState.path : defaultPersistPath,
		'v3',
	);

	return {
		cachePersist: path.join(persistPath, 'cache'),
		d1Persist: path.join(persistPath, 'd1'),
		durableObjectsPersist: path.join(persistPath, 'do'),
		kvPersist: path.join(persistPath, 'kv'),
		r2Persist: path.join(persistPath, 'r2'),
	};
}

function missingWorkerErrorMessage(workerName: string) {
	return `${workerName} does not match a worker name.`;
}

function getWorkerToWorkerEntrypointNamesMap(
	workers: Array<Pick<WorkerOptions, 'serviceBindings'> & { name: string }>,
) {
	const workerToWorkerEntrypointNamesMap = new Map(
		workers.map((workerOptions) => [workerOptions.name, new Set<string>()]),
	);

	for (const worker of workers) {
		for (const value of Object.values(worker.serviceBindings ?? {})) {
			if (
				typeof value === 'object' &&
				'name' in value &&
				typeof value.name === 'string' &&
				value.entrypoint !== undefined &&
				value.entrypoint !== 'default'
			) {
				const entrypointNames = workerToWorkerEntrypointNamesMap.get(
					value.name,
				);
				assert(entrypointNames, missingWorkerErrorMessage(value.name));

				entrypointNames.add(value.entrypoint);
			}
		}
	}

	return workerToWorkerEntrypointNamesMap;
}

function getWorkerToDurableObjectClassNamesMap(
	workers: Array<Pick<WorkerOptions, 'durableObjects'> & { name: string }>,
) {
	const workerToDurableObjectClassNamesMap = new Map(
		workers.map((workerOptions) => [workerOptions.name, new Set<string>()]),
	);

	for (const worker of workers) {
		for (const value of Object.values(worker.durableObjects ?? {})) {
			if (typeof value === 'string') {
				const classNames = workerToDurableObjectClassNamesMap.get(worker.name);
				assert(classNames, missingWorkerErrorMessage(worker.name));

				classNames.add(value);
			} else if (typeof value === 'object') {
				if (value.scriptName) {
					const classNames = workerToDurableObjectClassNamesMap.get(
						value.scriptName,
					);
					assert(classNames, missingWorkerErrorMessage(value.scriptName));

					classNames.add(value.className);
				} else {
					const classNames = workerToDurableObjectClassNamesMap.get(
						worker.name,
					);
					assert(classNames, missingWorkerErrorMessage(worker.name));

					classNames.add(value.className);
				}
			}
		}
	}

	return workerToDurableObjectClassNamesMap;
}

// We want module names to be their absolute path without the leading slash
// (i.e. the modules root should be the root directory). On Windows, we need
// paths to include the drive letter (i.e. `C:/a/b/c/index.mjs`).
// Internally, Miniflare uses `path.relative(modulesRoot, path)` to compute
// module names. Setting `modulesRoot` to a drive letter and prepending this
// to paths ensures correct names. This requires us to specify `contents` in
// the miniflare module definitions though, as the new paths don't exist.
const miniflareModulesRoot = process.platform === 'win32' ? 'Z:\\' : '/';
const ROUTER_WORKER_PATH = './asset-workers/router-worker.js';
const ASSET_WORKER_PATH = './asset-workers/asset-worker.js';
const WRAPPER_PATH = '__VITE_WORKER_ENTRY__';
const RUNNER_PATH = './runner-worker/index.js';

function getEntryWorkerConfig(
	resolvedPluginConfig: ResolvedPluginConfig,
): WorkerConfig | undefined {
	if (resolvedPluginConfig.type === 'assets-only') {
		return;
	}

	return resolvedPluginConfig.workers[
		resolvedPluginConfig.entryWorkerEnvironmentName
	];
}

export function getDevMiniflareOptions(
	resolvedPluginConfig: ResolvedPluginConfig,
	viteDevServer: vite.ViteDevServer,
): MiniflareOptions {
	const viteConfig = viteDevServer.config;
	const entryWorkerConfig = getEntryWorkerConfig(resolvedPluginConfig);
	const assetsConfig =
		resolvedPluginConfig.type === 'assets-only'
			? resolvedPluginConfig.config.assets
			: entryWorkerConfig?.assets;

	const assetWorkers: Array<WorkerOptions> = [
		{
			name: ROUTER_WORKER_NAME,
			compatibilityDate: ASSET_WORKERS_COMPATIBILITY_DATE,
			modulesRoot: miniflareModulesRoot,
			modules: [
				{
					type: 'ESModule',
					path: path.join(miniflareModulesRoot, ROUTER_WORKER_PATH),
					contents: fs.readFileSync(
						fileURLToPath(new URL(ROUTER_WORKER_PATH, import.meta.url)),
					),
				},
			],
			bindings: {
				CONFIG: {
					has_user_worker: resolvedPluginConfig.type === 'workers',
				},
			},
			serviceBindings: {
				ASSET_WORKER: ASSET_WORKER_NAME,
				...(entryWorkerConfig ? { USER_WORKER: entryWorkerConfig.name } : {}),
			},
		},
		{
			name: ASSET_WORKER_NAME,
			compatibilityDate: ASSET_WORKERS_COMPATIBILITY_DATE,
			modulesRoot: miniflareModulesRoot,
			modules: [
				{
					type: 'ESModule',
					path: path.join(miniflareModulesRoot, ASSET_WORKER_PATH),
					contents: fs.readFileSync(
						fileURLToPath(new URL(ASSET_WORKER_PATH, import.meta.url)),
					),
				},
			],
			bindings: {
				CONFIG: {
					...(assetsConfig?.html_handling
						? { html_handling: assetsConfig.html_handling }
						: {}),
					...(assetsConfig?.not_found_handling
						? { not_found_handling: assetsConfig.not_found_handling }
						: {}),
				},
			},
			serviceBindings: {
				__VITE_ASSET_EXISTS__: async (request) => {
					const { pathname } = new URL(request.url);
					const filePath = path.join(viteConfig.root, pathname);

					let exists: boolean;

					try {
						exists = fs.statSync(filePath).isFile();
					} catch (error) {
						exists = false;
					}

					return MiniflareResponse.json(exists);
				},
				__VITE_FETCH_ASSET__: async (request) => {
					const { pathname } = new URL(request.url);
					const filePath = path.join(viteConfig.root, pathname);

					try {
						let html = await fsp.readFile(filePath, 'utf-8');
						html = await viteDevServer.transformIndexHtml(pathname, html);

						return new MiniflareResponse(html, {
							headers: { 'Content-Type': 'text/html' },
						});
					} catch (error) {
						throw new Error(`Unexpected error. Failed to load ${pathname}`);
					}
				},
			},
		},
	];

	const userWorkers =
		resolvedPluginConfig.type === 'workers'
			? Object.entries(resolvedPluginConfig.workers).map(
					([environmentName, workerConfig]) => {
						const miniflareWorkerOptions = unstable_getMiniflareWorkerOptions({
							...workerConfig,
							assets: undefined,
						});

						const { ratelimits, ...workerOptions } =
							miniflareWorkerOptions.workerOptions;

						return {
							...workerOptions,
							// We have to add the name again because `unstable_getMiniflareWorkerOptions` sets it to `undefined`
							name: workerConfig.name,
							modulesRoot: miniflareModulesRoot,
							unsafeEvalBinding: '__VITE_UNSAFE_EVAL__',
							bindings: {
								...workerOptions.bindings,
								__VITE_ROOT__: viteConfig.root,
								__VITE_ENTRY_PATH__: workerConfig.main,
							},
							serviceBindings: {
								...workerOptions.serviceBindings,
								...(environmentName ===
									resolvedPluginConfig.entryWorkerEnvironmentName &&
								workerConfig.assets?.binding
									? {
											[workerConfig.assets.binding]: ASSET_WORKER_NAME,
										}
									: {}),
								__VITE_INVOKE_MODULE__: async (request) => {
									const payload = (await request.json()) as vite.CustomPayload;
									const invokePayloadData = payload.data as {
										id: string;
										name: string;
										data: [string, string, FetchFunctionOptions];
									};

									assert(
										invokePayloadData.name === 'fetchModule',
										`Invalid invoke event: ${invokePayloadData.name}`,
									);

									const [moduleId] = invokePayloadData.data;

									// For some reason we need this here for cloudflare built-ins (e.g. `cloudflare:workers`) but not for node built-ins (e.g. `node:path`)
									// See https://github.com/flarelabs-net/vite-plugin-cloudflare/issues/46
									if (moduleId.startsWith('cloudflare:')) {
										const result = {
											externalize: moduleId,
											type: 'builtin',
										} satisfies vite.FetchResult;

										return new MiniflareResponse(JSON.stringify({ result }));
									}

									// Sometimes Vite fails to resolve built-ins and converts them to "url-friendly" ids
									// that start with `/@id/...`.
									// This was necessary for `nodejs_compat` to work but has been removed as it had unintended side-effects.
									// An alternative will be implemented in #63
									// if (moduleId.startsWith('/@id/')) {
									// 	const result = {
									// 		externalize: moduleId.slice('/@id/'.length),
									// 		type: 'builtin',
									// 	} satisfies vite.FetchResult;

									// 	return new MiniflareResponse(JSON.stringify({ result }));
									// }

									const devEnvironment = viteDevServer.environments[
										environmentName
									] as CloudflareDevEnvironment;

									const result = await devEnvironment.hot.handleInvoke(payload);

									return new MiniflareResponse(JSON.stringify(result));
								},
							},
						} satisfies Partial<WorkerOptions>;
					},
				)
			: [];

	const workerToWorkerEntrypointNamesMap =
		getWorkerToWorkerEntrypointNamesMap(userWorkers);
	const workerToDurableObjectClassNamesMap =
		getWorkerToDurableObjectClassNamesMap(userWorkers);

	const logger = new ViteMiniflareLogger(viteConfig);

	return {
		log: logger,
		handleRuntimeStdio(stdout, stderr) {
			const decoder = new TextDecoder();
			stdout.forEach((data) => logger.info(decoder.decode(data)));
			stderr.forEach((error) =>
				logger.logWithLevel(LogLevel.ERROR, decoder.decode(error)),
			);
		},
		...getPersistence(viteConfig.root, resolvedPluginConfig.persistState),
		workers: [
			...assetWorkers,
			...userWorkers.map((workerOptions) => {
				const wrappers = [
					`import { createWorkerEntrypointWrapper, createDurableObjectWrapper } from '${RUNNER_PATH}';`,
					`export default createWorkerEntrypointWrapper('default');`,
				];

				const entrypointNames = workerToWorkerEntrypointNamesMap.get(
					workerOptions.name,
				);
				assert(
					entrypointNames,
					`WorkerEntrypoint names not found for worker ${workerOptions.name}`,
				);

				for (const entrypointName of [...entrypointNames].sort()) {
					wrappers.push(
						`export const ${entrypointName} = createWorkerEntrypointWrapper('${entrypointName}');`,
					);
				}

				const classNames = workerToDurableObjectClassNamesMap.get(
					workerOptions.name,
				);
				assert(
					classNames,
					`DurableObject class names not found for worker ${workerOptions.name}`,
				);

				for (const className of [...classNames].sort()) {
					wrappers.push(
						`export const ${className} = createDurableObjectWrapper('${className}');`,
					);
				}

				return {
					...workerOptions,
					modules: [
						{
							type: 'ESModule',
							path: path.join(miniflareModulesRoot, WRAPPER_PATH),
							contents: wrappers.join('\n'),
						},
						{
							type: 'ESModule',
							path: path.join(miniflareModulesRoot, RUNNER_PATH),
							contents: fs.readFileSync(
								fileURLToPath(new URL(RUNNER_PATH, import.meta.url)),
							),
						},
					],
				} satisfies WorkerOptions;
			}),
		],
	};
}

function getEntryModule(main: string | undefined) {
	assert(
		main,
		'Unexpected error: missing main field in miniflareWorkerOptions',
	);

	return {
		scriptPath: main,
	};
}

export function getPreviewMiniflareOptions(
	resolvedPluginConfig: ResolvedPluginConfig,
	vitePreviewServer: vite.PreviewServer,
): MiniflareOptions {
	const viteConfig = vitePreviewServer.config;
	// For now, we are enforcing that packages are always inside the same build directory
	const buildDirectory = path.resolve(viteConfig.root, viteConfig.build.outDir);

	const configPath =
		resolvedPluginConfig.type === 'workers'
			? path.join(
					buildDirectory,
					resolvedPluginConfig.entryWorkerEnvironmentName,
					'wrangler.json',
				)
			: path.join(buildDirectory, 'wrangler.json');
	const configs = [
		unstable_readConfig({ config: configPath }, {}),
		...(resolvedPluginConfig.type === 'workers'
			? Object.keys(resolvedPluginConfig.workers)
					.filter(
						(environmentName) =>
							environmentName !==
							resolvedPluginConfig.entryWorkerEnvironmentName,
					)
					.map((environmentName) =>
						unstable_readConfig(
							{
								config: path.join(
									buildDirectory,
									environmentName,
									'wrangler.json',
								),
							},
							{},
						),
					)
			: []),
	];

	const workers: Array<WorkerOptions> = configs.map((config) => {
		const miniflareWorkerOptions = unstable_getMiniflareWorkerOptions(config);

		const { ratelimits, ...workerOptions } =
			miniflareWorkerOptions.workerOptions;

		return {
			...workerOptions,
			// We have to add the name again because `unstable_getMiniflareWorkerOptions` sets it to `undefined`
			name: config.name,
			modules: true,
			...(resolvedPluginConfig.type === 'workers'
				? getEntryModule(miniflareWorkerOptions.main)
				: {
						script: '',
					}),
		};
	});

	const logger = new ViteMiniflareLogger(viteConfig);

	return {
		log: logger,
		handleRuntimeStdio(stdout, stderr) {
			const decoder = new TextDecoder();
			stdout.forEach((data) => logger.info(decoder.decode(data)));
			stderr.forEach((error) =>
				logger.logWithLevel(LogLevel.ERROR, decoder.decode(error)),
			);
		},
		...getPersistence(viteConfig.root, resolvedPluginConfig.persistState),
		workers,
	};
}

/**
 * A Miniflare logger that forwards messages onto a Vite logger.
 */
class ViteMiniflareLogger extends Log {
	private logger: vite.Logger;
	constructor(config: vite.ResolvedConfig) {
		super(miniflareLogLevelFromViteLogLevel(config.logLevel));
		this.logger = config.logger;
	}

	override logWithLevel(level: LogLevel, message: string) {
		if (/^Ready on http/.test(message)) {
			level = LogLevel.DEBUG;
		}
		switch (level) {
			case LogLevel.ERROR:
				return this.logger.error(message);
			case LogLevel.WARN:
				return this.logger.warn(message);
			case LogLevel.INFO:
				return this.logger.info(message);
		}
	}
}

function miniflareLogLevelFromViteLogLevel(
	level: vite.LogLevel = 'info',
): LogLevel {
	switch (level) {
		case 'error':
			return LogLevel.ERROR;
		case 'warn':
			return LogLevel.WARN;
		case 'info':
			return LogLevel.INFO;
		case 'silent':
			return LogLevel.NONE;
	}
}
