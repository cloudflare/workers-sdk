import type { DevEnvironment } from 'vite';

export const UNKNOWN_HOST = 'http://localhost';

interface FetchableDevEnvironment extends DevEnvironment {
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
