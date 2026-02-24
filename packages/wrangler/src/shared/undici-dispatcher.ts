import { Agent, EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { noProxy, proxy } from "../utils/constants";
import { getNodeExtraCaCerts } from "./ca-certs";

let initialized = false;

/**
 * Idempotent global undici dispatcher setup.
 *
 * Configures:
 * - HTTP(S) proxy support via EnvHttpProxyAgent when proxy env vars are set
 * - NODE_EXTRA_CA_CERTS for TLS connections (corporate proxies, WARP, etc.)
 *
 * Safe to call from multiple entry points (CLI + library API). Only the first
 * call takes effect; subsequent calls are no-ops.
 *
 * @returns `{ proxy: true }` when a proxy dispatcher was installed,
 *          `{ proxy: false }` otherwise.
 */
export function initUndiciDispatcher(): { proxy: boolean } {
	if (initialized) {
		return { proxy: Boolean(proxy) };
	}
	initialized = true;

	const ca = getNodeExtraCaCerts();

	if (proxy) {
		setGlobalDispatcher(
			new EnvHttpProxyAgent({
				noProxy: noProxy || "localhost,127.0.0.1,::1",
				...(ca ? { requestTls: { ca }, proxyTls: { ca } } : {}),
			})
		);
		return { proxy: true };
	}

	if (ca) {
		setGlobalDispatcher(new Agent({ connect: { ca } }));
	}

	return { proxy: false };
}
