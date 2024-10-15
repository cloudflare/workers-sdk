import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Log, LogLevel, Response as MiniflareResponse } from 'miniflare';
import * as vite from 'vite';
import { unstable_getMiniflareWorkerOptions } from 'wrangler';
import { getModuleFallbackHandler, getResolveId } from './module-fallback';
import { invariant, WORKERD_CUSTOM_IMPORT_PATH } from './shared';
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
const WRAPPER_PATH = '__VITE_WORKER_ENTRY__';
const RUNNER_PATH = './runner/index.js';

export function getMiniflareOptions(
	normalizedPluginConfig: NormalizedPluginConfig,
	viteConfig: vite.ResolvedConfig,
	viteDevServer: vite.ViteDevServer,
): MiniflareOptions {
	const workers = normalizedPluginConfig.workers.map((worker) => {
		const miniflareOptions = unstable_getMiniflareWorkerOptions(
			worker.wranglerConfigPath,
		);

		const { ratelimits, ...workerOptions } = miniflareOptions.workerOptions;

		return {
			...workerOptions,
			name: worker.name,
			modulesRoot: miniflareModulesRoot,
			unsafeEvalBinding: '__VITE_UNSAFE_EVAL__',
			bindings: {
				...workerOptions.bindings,
				__VITE_ROOT__: viteConfig.root,
				__VITE_ENTRY_PATH__: worker.entryPath,
			},
		} satisfies Partial<WorkerOptions>;
	});

	const workerToWorkerEntrypointNamesMap =
		getWorkerToWorkerEntrypointNamesMap(workers);
	const workerToDurableObjectClassNamesMap =
		getWorkerToDurableObjectClassNamesMap(workers);

	// TODO: we only have a single module resolution strategy shared across all workers
	//       (generated using the first worker's dev environment)
	//       we should investigate and ideally have potential different resolutions per worker
	//       see: https://github.com/flarelabs-net/vite-plugin-cloudflare/issues/19
	const firstWorkerName = workers[0]?.name;
	invariant(firstWorkerName, 'First worker name not found');
	const devEnvironment = viteDevServer.environments[firstWorkerName];
	invariant(devEnvironment, 'First worker dev environment not found');
	const resolveId = getResolveId(viteConfig, devEnvironment);

	const logger = new ViteMiniflareLogger(viteConfig);
	return {
		log: logger,
		handleRuntimeStdio(stdout, stderr) {
			stdout.forEach((data) => logger.info(data));
			stderr.forEach((error) => logger.error(error));
		},
		...getPersistence(normalizedPluginConfig.persistPath),
		workers: workers.map((workerOptions) => {
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
				unsafeUseModuleFallbackService: true,
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
					{
						// Declared as a CommonJS module so that `require` is made available and we are able to handle cjs imports
						type: 'CommonJS',
						path: path.join(miniflareModulesRoot, WORKERD_CUSTOM_IMPORT_PATH),
						contents: 'module.exports = path => import(path)',
					},
				],
				serviceBindings: {
					...workerOptions.serviceBindings,
					__VITE_FETCH_MODULE__: async (request) => {
						const [moduleId, imported, options] = (await request.json()) as [
							string,
							string,
							FetchFunctionOptions,
						];

						const devEnvironment = viteDevServer.environments[
							workerOptions.name
						] as CloudflareDevEnvironment;

						try {
							const result = await devEnvironment.fetchModule(
								moduleId,
								imported,
								options,
							);

							return new MiniflareResponse(JSON.stringify(result));
						} catch (error) {
							if (moduleId.startsWith('cloudflare:')) {
								const result = {
									externalize: moduleId,
									type: 'module',
								} satisfies vite.FetchResult;

								return new MiniflareResponse(JSON.stringify(result));
							}
							throw new Error(
								`Unexpected Error, failed to get module: ${moduleId}`,
							);
						}
					},
				},
			};
		}),
		unsafeModuleFallbackService: getModuleFallbackHandler(resolveId),
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
