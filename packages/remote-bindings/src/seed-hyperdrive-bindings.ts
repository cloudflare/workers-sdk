import { setTimeout as delay } from "node:timers/promises";
import { HyperdriveSchema } from "miniflare";
import WebSocket from "ws";
import type { Binding } from "@cloudflare/workers-utils";
import type { RemoteProxyConnectionString } from "miniflare";

/** Reads edge credentials from a throwaway relay connection. Never log the result. */
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
				"MF-Connect-Address": "hyperdrive.local:0",
			},
		});
		let settled = false;
		const cleanup = () => {
			clearTimeout(timer);
			ws.removeAllListeners("upgrade");
			ws.removeAllListeners("close");
			ws.removeAllListeners("error");
			// Terminating an unfinished handshake emits an asynchronous error.
			ws.on("error", () => {});
			ws.terminate();
		};
		const fail = (reason: string) => {
			if (settled) {
				return;
			}
			settled = true;
			cleanup();
			reject(
				new Error(
					`Failed to seed remote Hyperdrive binding "${bindingName}": ${reason}`
				)
			);
		};
		const timer = setTimeout(() => {
			fail("the remote proxy did not respond in time.");
		}, 10_000);
		ws.on("upgrade", (response) => {
			const connectionString = response.headers["mf-hd-connection-string"];
			if (typeof connectionString !== "string") {
				fail("the remote proxy did not return a connection string.");
			} else if (!HyperdriveSchema.safeParse(connectionString).success) {
				// Zod errors can contain input values, including passwords.
				fail("the remote proxy returned an invalid connection string.");
			} else if (!settled) {
				settled = true;
				cleanup();
				resolve(connectionString);
			}
		});
		ws.on("error", () => fail("the remote proxy connection failed."));
		ws.on("close", () =>
			fail("the remote proxy closed before returning credentials.")
		);
	});
}

const SEED_ATTEMPTS = 3;
const SEED_RETRY_BACKOFF_MS = 500;

/** Retries transient failures within a bounded startup window. */
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
		} catch {
			// Neither transport errors nor schema errors may expose credentials.
			lastError = new Error(
				`Failed to seed remote Hyperdrive binding "${bindingName}". Check your authentication and internet connection, then retry.`
			);
			if (attempt < SEED_ATTEMPTS) {
				await delay(SEED_RETRY_BACKOFF_MS * attempt);
			}
		}
	}
	throw lastError;
}

/**
 * Fetches remote Hyperdrive credentials before consumers assemble Miniflare
 * options. These values are secrets and are not a cross-instance affinity
 * guarantee. Returns an empty map when no session or remote Hyperdrive exists.
 *
 * @param bindings Worker bindings, which are never mutated.
 * @param remoteProxyConnectionString The ready session's proxy address.
 * @returns Connection strings keyed by binding name.
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
		([, binding]) => binding.type === "hyperdrive" && binding.remote
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
