import { setTimeout as delay } from "node:timers/promises";
import WebSocket from "ws";
import type { Binding } from "@cloudflare/workers-utils";
import type { RemoteProxyConnectionString } from "miniflare";

/**
 * A remote Hyperdrive binding is reached from local dev through a TCP bridge
 * that relays the connection to the edge Hyperdrive proxy (see
 * `HyperdriveProxyController.createRemoteTcpBridge` in miniflare). The edge
 * proxy mints per-session dummy credentials and uses the config id as the
 * database name, so a database client must present *those* values to
 * authenticate through the proxy — the user's local placeholder credentials
 * only get as far as the server greeting.
 *
 * The credentials belong to the connection the edge opens, not to the binding
 * in the abstract, so they have to be read from a real one: this opens a
 * throwaway relay connection and takes the values the edge reports on the
 * upgrade response. Asking for them through a separate request can land on a
 * different instance and hand back credentials that connection will reject.
 *
 * The returned value is a live credential: callers MUST treat it as a secret
 * and MUST NOT log it.
 */
async function fetchEdgeConnectionString(
	remoteProxyConnectionString: RemoteProxyConnectionString,
	bindingName: string
): Promise<string> {
	const wsUrl = new URL(String(remoteProxyConnectionString));
	wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";

	return new Promise<string>((resolve, reject) => {
		const ws = new WebSocket(wsUrl.href, {
			headers: {
				"MF-Binding": bindingName,
				// The edge ignores this for Hyperdrive, but the relay path requires
				// the header to be present.
				"MF-Connect-Address": "hyperdrive.local:0",
			},
		});
		const fail = (reason: string) =>
			reject(
				new Error(
					`Failed to seed remote Hyperdrive binding "${bindingName}": ${reason}`
				)
			);
		const timer = setTimeout(() => {
			ws.close();
			fail("the remote proxy did not respond in time.");
		}, 10_000);
		ws.on("upgrade", (response) => {
			clearTimeout(timer);
			const connectionString = response.headers["mf-hd-connection-string"];
			ws.close();
			if (typeof connectionString === "string") {
				resolve(connectionString);
			} else {
				fail("the remote proxy did not return a connection string.");
			}
		});
		ws.on("error", (error) => {
			clearTimeout(timer);
			fail(error.message);
		});
	});
}

/**
 * How many times to ask the edge for a binding's credentials before giving up.
 *
 * A single attempt was enough while a failure here aborted session setup: the
 * caller saw the error and restarted. Now that a failure degrades instead, the
 * consumer decides whether it ever gets another chance — and
 * `getPlatformProxy()` does not, because it builds one Miniflare instance for
 * the life of the host process and never re-enters the seeding path. One
 * timed-out request at startup would leave that process's Hyperdrive bindings
 * unauthenticated until it was restarted.
 *
 * Retrying here absorbs the transient case so the degraded path is reserved
 * for an edge that is genuinely unreachable. Worst case this blocks startup
 * for roughly the per-attempt timeout times the attempt count, which is the
 * cost of not silently shipping a broken binding.
 */
const SEED_ATTEMPTS = 3;

/** Base delay between seeding attempts; scaled by the attempt number. */
const SEED_RETRY_BACKOFF_MS = 500;

/**
 * {@link fetchEdgeConnectionString}, retried a few times before the failure is
 * allowed to surface.
 */
async function fetchEdgeConnectionStringWithRetry(
	remoteProxyConnectionString: RemoteProxyConnectionString,
	bindingName: string
): Promise<string> {
	let lastError: unknown;
	for (let attempt = 1; attempt <= SEED_ATTEMPTS; attempt++) {
		try {
			return await fetchEdgeConnectionString(
				remoteProxyConnectionString,
				bindingName
			);
		} catch (error) {
			lastError = error;
			if (attempt < SEED_ATTEMPTS) {
				await delay(SEED_RETRY_BACKOFF_MS * attempt);
			}
		}
	}
	throw lastError;
}

/**
 * Fetches the edge session's connection string for every remote Hyperdrive
 * binding, so that the local binding can present credentials the edge
 * Hyperdrive proxy will accept.
 *
 * `buildMiniflareBindingOptions` is synchronous, so this async step must run
 * once the remote proxy session is ready and before miniflare options are
 * built.
 *
 * The seeded values are *returned* rather than written onto the passed
 * `bindings`: those binding objects are shared by reference with the record the
 * remote proxy session keeps for change detection (`pickRemoteBindings` copies
 * the record, not the objects). Mutating them would make the next reload's
 * freshly-loaded config compare unequal to the stored, seeded one, tearing down
 * and re-establishing the remote session on every file save.
 *
 * Returns an empty map when there is no remote proxy session or no remote
 * Hyperdrive bindings.
 */
export async function seedRemoteHyperdriveBindings(
	bindings: Record<string, Binding> | undefined,
	remoteProxyConnectionString: RemoteProxyConnectionString | undefined
): Promise<Map<string, string>> {
	const seeded = new Map<string, string>();

	if (!remoteProxyConnectionString || !bindings) {
		return seeded;
	}

	const remoteHyperdrives = Object.entries(bindings).filter(
		(entry): entry is [string, Binding & { remote?: boolean }] => {
			const [, binding] = entry;
			return (
				binding.type === "hyperdrive" &&
				"remote" in binding &&
				Boolean(binding.remote)
			);
		}
	);

	await Promise.all(
		remoteHyperdrives.map(async ([name]) => {
			const connectionString = await fetchEdgeConnectionStringWithRetry(
				remoteProxyConnectionString,
				name
			);
			seeded.set(name, connectionString);
		})
	);

	return seeded;
}
