import * as vite from 'vite';
import type { DevEnvironment } from 'vite';

export const UNKNOWN_HOST = 'http://localhost';

export interface FetchableDevEnvironment extends DevEnvironment {
	dispatchFetch(request: Request): Promise<Response>;
}

export function assertIsFetchableDevEnvironment(
	environment: DevEnvironment | undefined,
): asserts environment is FetchableDevEnvironment {
	if (
		!(
			environment &&
			'dispatchFetch' in environment &&
			typeof environment.dispatchFetch === 'function'
		)
	) {
		throw Error('Not a FetchableDevEnvironment');
	}
}

export function getWorker(server: vite.ViteDevServer, workerName = 'worker') {
	const worker = server.environments[workerName];
	assertIsFetchableDevEnvironment(worker);
	return worker;
}

export class MockLogger implements vite.Logger {
	logs: string[][] = [];
	hasWarned = false;

	info(msg: string, options?: vite.LogOptions): void {
		this.logs.push(['info', msg]);
	}
	warn(msg: string, options?: vite.LogOptions): void {
		this.hasWarned = true;
		this.logs.push(['warn', msg]);
	}
	warnOnce(msg: string, options?: vite.LogOptions): void {
		this.hasWarned = true;
		this.logs.push(['warnOnce', msg]);
	}
	error(msg: string, options?: vite.LogErrorOptions): void {
		this.logs.push(['error', msg]);
	}
	clearScreen(type: vite.LogType): void {
		this.logs.push(['clear screen']);
	}
	hasErrorLogged(error: Error | vite.Rollup.RollupError): boolean {
		throw new Error('Not implemented');
	}

	getLogs(type: string) {
		return this.logs
			.filter((log) => log[0] === type)
			.map((log) => log[1]?.trim())
			.join('\n');
	}
}

export function getFallbackErrors(logger: MockLogger) {
	return logger.logs
		.map(
			(log) =>
				log[0] === 'error' &&
				log[1]?.match(
					/Fallback service failed to fetch module;.+rawSpecifier=(.+)(:?&|\n)/,
				)?.[1],
		)
		.filter(Boolean);
}
