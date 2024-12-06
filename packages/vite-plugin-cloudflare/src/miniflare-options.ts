import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Log, LogLevel, Response as MiniflareResponse } from 'miniflare';
import * as vite from 'vite';
import {
	ASSET_WORKER_NAME,
	ASSET_WORKERS_COMPATIBILITY_DATE,
	ROUTER_WORKER_NAME,
} from './assets';
import { invariant } from './shared';
import type { CloudflareDevEnvironment } from './cloudflare-environment';
import type { NormalizedPluginConfig } from './plugin-config';
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

export function getPersistence(persistPath: string | false): PersistOptions {
	if (persistPath === false) {
		return {};
	}

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

export function getWorkerToWorkerEntrypointNamesMap(
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
				invariant(entrypointNames, missingWorkerErrorMessage(value.name));

				entrypointNames.add(value.entrypoint);
			}
		}
	}

	return workerToWorkerEntrypointNamesMap;
}

export function getWorkerToDurableObjectClassNamesMap(
	workers: Array<Pick<WorkerOptions, 'durableObjects'> & { name: string }>,
) {
	const workerToDurableObjectClassNamesMap = new Map(
		workers.map((workerOptions) => [workerOptions.name, new Set<string>()]),
	);

	for (const worker of workers) {
		for (const value of Object.values(worker.durableObjects ?? {})) {
			if (typeof value === 'string') {
				const classNames = workerToDurableObjectClassNamesMap.get(worker.name);
				invariant(classNames, missingWorkerErrorMessage(worker.name));

				classNames.add(value);
			} else if (typeof value === 'object') {
				if (value.scriptName) {
					const classNames = workerToDurableObjectClassNamesMap.get(
						value.scriptName,
					);
					invariant(classNames, missingWorkerErrorMessage(value.scriptName));

					classNames.add(value.className);
				} else {
					const classNames = workerToDurableObjectClassNamesMap.get(
						worker.name,
					);
					invariant(classNames, missingWorkerErrorMessage(worker.name));

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

export function getDevMiniflareOptions(
	normalizedPluginConfig: NormalizedPluginConfig,
	viteConfig: vite.ResolvedConfig,
	viteDevServer: vite.ViteDevServer,
): MiniflareOptions {
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
					has_user_worker: normalizedPluginConfig.entryWorkerName
						? true
						: false,
				},
			},
			serviceBindings: {
				ASSET_WORKER: ASSET_WORKER_NAME,
				...(normalizedPluginConfig.entryWorkerName
					? { USER_WORKER: normalizedPluginConfig.entryWorkerName }
					: {}),
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
					...(normalizedPluginConfig.assets.htmlHandling
						? { html_handling: normalizedPluginConfig.assets.htmlHandling }
						: {}),
					...(normalizedPluginConfig.assets.notFoundHandling
						? {
								not_found_handling:
									normalizedPluginConfig.assets.notFoundHandling,
							}
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

	const userWorkers = Object.values(normalizedPluginConfig.workers).map(
		(worker) => {
			return {
				...worker.workerOptions,
				modulesRoot: miniflareModulesRoot,
				unsafeEvalBinding: '__VITE_UNSAFE_EVAL__',
				bindings: {
					...worker.workerOptions.bindings,
					__VITE_ROOT__: viteConfig.root,
					__VITE_ENTRY_PATH__: worker.entryPath,
				},
				serviceBindings: {
					...worker.workerOptions.serviceBindings,
					...(worker.workerOptions.name ===
						normalizedPluginConfig.entryWorkerName && worker.assetsBinding
						? { [worker.assetsBinding]: ASSET_WORKER_NAME }
						: {}),
				},
			} satisfies Partial<WorkerOptions>;
		},
	);

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
		...getPersistence(normalizedPluginConfig.persistPath),
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
				invariant(
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
				invariant(
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
					serviceBindings: {
						...workerOptions.serviceBindings,
						__VITE_INVOKE_MODULE__: async (request) => {
							const payload = (await request.json()) as vite.CustomPayload;
							const invokePayloadData = payload.data as {
								id: string;
								name: string;
								data: [string, string, FetchFunctionOptions];
							};

							invariant(
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

								return new MiniflareResponse(JSON.stringify({ r: result }));
							}

							// Sometimes Vite fails to resolve built-ins and converts them to "url-friendly" ids
							// that start with `/@id/...`.
							if (moduleId.startsWith('/@id/')) {
								const result = {
									externalize: moduleId.slice('/@id/'.length),
									type: 'builtin',
								} satisfies vite.FetchResult;

								return new MiniflareResponse(JSON.stringify({ r: result }));
							}

							const devEnvironment = viteDevServer.environments[
								workerOptions.name
							] as CloudflareDevEnvironment;

							const result = await devEnvironment.hot.handleInvoke(payload);

							return new MiniflareResponse(JSON.stringify(result));
						},
					},
				} satisfies WorkerOptions;
			}),
		],
	};
}

export function getPreviewMiniflareOptions(
	normalizedPluginConfig: NormalizedPluginConfig,
	viteConfig: vite.ResolvedConfig,
): MiniflareOptions {
	const entryWorkerConfig = normalizedPluginConfig.entryWorkerName
		? normalizedPluginConfig.workers[normalizedPluginConfig.entryWorkerName]
		: undefined;

	const assetsDirectory = path.resolve(
		viteConfig.root,
		viteConfig.build.outDir,
		'client',
	);
	const hasAssets = fs.existsSync(assetsDirectory);
	const assetsOptions = hasAssets
		? {
				assets: {
					routingConfig: {
						has_user_worker: entryWorkerConfig ? true : false,
					},
					assetConfig: {
						...(normalizedPluginConfig.assets.htmlHandling
							? { html_handling: normalizedPluginConfig.assets.htmlHandling }
							: {}),
						...(normalizedPluginConfig.assets.notFoundHandling
							? {
									not_found_handling:
										normalizedPluginConfig.assets.notFoundHandling,
								}
							: {}),
					},
					directory: assetsDirectory,
					...(entryWorkerConfig?.assetsBinding
						? { binding: entryWorkerConfig.assetsBinding }
						: {}),
				},
			}
		: {};

	const workers: Array<WorkerOptions> = [
		...(entryWorkerConfig
			? [
					{
						...entryWorkerConfig.workerOptions,
						...assetsOptions,
						modules: [
							{
								type: 'ESModule',
								path: path.resolve(
									viteConfig.root,
									viteConfig.build.outDir,
									entryWorkerConfig.workerOptions.name,
									'index.js',
								),
							} as const,
						],
					},
				]
			: [
					{
						...assetsOptions,
						name: 'assets-only',
						script: '',
						modules: true,
					},
				]),
		...Object.values(normalizedPluginConfig.workers)
			.filter(
				(config) =>
					config.workerOptions.name !== normalizedPluginConfig.entryWorkerName,
			)
			.map((config) => {
				return {
					...config.workerOptions,
					modules: [
						{
							type: 'ESModule',
							path: path.resolve(
								viteConfig.root,
								viteConfig.build.outDir,
								config.workerOptions.name,
								'index.js',
							),
						} as const,
					],
				};
			}),
	];

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
		...getPersistence(normalizedPluginConfig.persistPath),
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
