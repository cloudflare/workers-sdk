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
 * This fetches the edge binding's `connectionString` from the remote-proxy
 * worker's `MF-HD-Seed` endpoint so the local Hyperdrive binding can be
 * configured with credentials that match the live session.
 *
 * The returned value is a live credential: callers MUST treat it as a secret
 * and MUST NOT log it.
 */
async function fetchEdgeConnectionString(
	remoteProxyConnectionString: RemoteProxyConnectionString,
	bindingName: string
): Promise<string> {
	const response = await fetch(String(remoteProxyConnectionString), {
		headers: {
			"MF-HD-Seed": "true",
			"MF-Binding": bindingName,
		},
	});
	if (!response.ok) {
		throw new Error(
			`Failed to seed remote Hyperdrive binding "${bindingName}": ` +
				`the remote proxy responded with status ${response.status}.`
		);
	}
	const body = (await response.json()) as { connectionString?: unknown };
	if (typeof body.connectionString !== "string") {
		throw new Error(
			`Failed to seed remote Hyperdrive binding "${bindingName}": ` +
				`the remote proxy did not return a connection string.`
		);
	}
	return body.connectionString;
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
			const connectionString = await fetchEdgeConnectionString(
				remoteProxyConnectionString,
				name
			);
			seeded.set(name, connectionString);
		})
	);

	return seeded;
}
