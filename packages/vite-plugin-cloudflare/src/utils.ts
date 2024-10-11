import { invariant } from './shared';
import type { WorkerOptions } from 'miniflare';

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
