import { UserError } from "@cloudflare/workers-utils";
import ci from "ci-info";
import getPort, { portNumbers } from "get-port";

// Probe consecutive ports to increase the chance to get the same port across dev sessions.
// In CI, we avoid probing consecutive ports to reduce the chance of collisions
const NUM_CONSECUTIVE_PORTS_TO_PROBE = ci.isCI ? 0 : 10;

function isNetworkBindPermissionError(e: unknown): boolean {
	return (
		e !== null &&
		typeof e === "object" &&
		"code" in e &&
		(e.code === "EPERM" || e.code === "EACCES") &&
		"syscall" in e &&
		(e.syscall === "listen" || e.syscall === "bind")
	);
}

/**
 * Get an available TCP port number.
 *
 * Notes:
 * - We probe `NUM_CONSECUTIVE_PORTS_TO_PROBE` consecutive ports starting from `defaultPort` before falling back to a random port.
 * - Avoiding calling `getPort()` multiple times by memoizing the first result.
 *
 * @param defaultPort The preferred port to use when available
 * @param defaultHost The default host to probe for available ports (can be overridden per-call)
 */
export function memoizeGetPort(defaultPort: number, defaultHost: string) {
	let portValue: number | undefined;
	let cachedHost = defaultHost;
	return async (forHost: string = defaultHost) => {
		if (forHost !== cachedHost) {
			portValue = undefined;
			cachedHost = forHost;
		}
		try {
			// Check a specific host to avoid probing all local addresses.
			portValue =
				portValue ??
				(await getPort({
					port: portNumbers(
						defaultPort,
						defaultPort + NUM_CONSECUTIVE_PORTS_TO_PROBE
					),
					host: forHost,
				}));
			return portValue;
		} catch (e) {
			if (isNetworkBindPermissionError(e)) {
				throw new UserError(
					`Failed to bind to ${forHost}:${defaultPort}: permission denied.\n` +
						`This usually means a sandbox or security policy is preventing network access.\n` +
						`If you are running inside a restricted environment (container, VM, AI coding agent, etc.),\n` +
						`configure it to allow binding to loopback addresses.`
				);
			}
			throw e;
		}
	};
}
