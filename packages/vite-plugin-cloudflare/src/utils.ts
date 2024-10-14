import * as path from 'node:path';
import { invariant } from './shared';
import type { SharedOptions, WorkerOptions } from 'miniflare';

const DEFAULT_PERSIST_PATH = '.wrangler/state/v3';

type PersistOptions = Pick<
	SharedOptions,
	| 'cachePersist'
	| 'd1Persist'
	| 'durableObjectsPersist'
	| 'kvPersist'
	| 'r2Persist'
>;

export function getPersistence(
	persistTo: string | false | undefined,
	root: string,
): PersistOptions {
	if (persistTo === false) {
		return {};
	}

	const rootPersistPath = path.resolve(root, persistTo ?? DEFAULT_PERSIST_PATH);

	return {
		cachePersist: path.join(rootPersistPath, 'cache'),
		d1Persist: path.join(rootPersistPath, 'd1'),
		durableObjectsPersist: path.join(rootPersistPath, 'do'),
		kvPersist: path.join(rootPersistPath, 'kv'),
		r2Persist: path.join(rootPersistPath, 'r2'),
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
