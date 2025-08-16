import getPort from "get-port";

/**
 * Get an available TCP port number.
 *
 * Avoiding calling `getPort()` multiple times by memoizing the first result.
 */
export function memoizeGetPort(defaultPort: number, host: string) {
	let portValue: number | undefined;
	let cachedHost = host;
	return async (forHost: string = host) => {
		if (forHost !== cachedHost) {
			portValue = undefined;
			cachedHost = forHost;
		}
		// Check a specific host to avoid probing all local addresses.
		portValue = portValue ?? (await getPort({ port: defaultPort, host: host }));
		return portValue;
	};
}
