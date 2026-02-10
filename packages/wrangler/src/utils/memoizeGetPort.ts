import ci from "ci-info";
import getPort, { portNumbers } from "get-port";

// Probe consecutive ports to increase the chance to get the same port across dev sessions.
// In CI, we avoid probing consecutive ports to reduce the chance of collisions
const NUM_CONSECUTIVE_PORTS_TO_PROBE = ci.isCI ? 0 : 10;

/**
 * Get an available TCP port number.
 *
 * Notes:
 * - We probe `NUM_CONSECUTIVE_PORTS_TO_PROBE` consecutive ports starting from `defaultPort` before falling back to a random port.
 * - Avoiding calling `getPort()` multiple times by memoizing the first result.
 *
 * @param defaultPort The preferred port to use when available
 * @param host The host to probe for available ports
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
		portValue =
			portValue ??
			(await getPort({
				port: portNumbers(
					defaultPort,
					defaultPort + NUM_CONSECUTIVE_PORTS_TO_PROBE
				),
				host,
			}));
		return portValue;
	};
}
