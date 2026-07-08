import assert from "node:assert";
import { pickRemoteBindings } from "./pick-remote-bindings";
import { startRemoteProxySession } from "./start-session";
import type { Logger } from "./logger";
import type {
	RemoteProxySession,
	StartRemoteProxySessionOptions,
} from "./types";
import type { Binding } from "@cloudflare/workers-utils";

/** The worker whose remote bindings should be proxied. */
export interface RemoteProxyWorker {
	/** The name of the worker (used as the preview session name). */
	name?: string;
	/** All of the worker's bindings (local + remote). */
	bindings: Record<string, Binding>;
	/** The account that owns the worker. */
	accountId?: string;
	/** If running in a non-public compliance region (e.g. "eu"), set this here. */
	complianceRegion?: string;
}

/** Data describing a running remote proxy session. */
export interface RemoteProxySessionData {
	session: RemoteProxySession;
	remoteBindings: Record<string, Binding>;
}

export interface MaybeStartOrUpdateRemoteProxySessionOptions {
	/**
	 * Auth credentials, or a callback that resolves them lazily. When omitted,
	 * the built-in env-var/OAuth resolver is used (see
	 * {@link import("./auth").createEnvAuthResolver}).
	 */
	auth?: StartRemoteProxySessionOptions["auth"];
	/** Logger for debug output. */
	logger?: Logger;
}

function bindingsEqual(a: unknown, b: unknown): boolean {
	try {
		assert.deepStrictEqual(a, b);
		return true;
	} catch {
		return false;
	}
}

/**
 * Start, update, reuse, or tear down a remote proxy session for a worker.
 *
 * This is the auth-agnostic lifecycle helper that consumers (e.g. the Vite
 * plugin) call on every config (re)load. It:
 *
 *  - picks the worker's remote bindings;
 *  - returns `null` (disposing any existing session) when there are none;
 *  - starts a new session when there isn't one;
 *  - updates the existing session's bindings when they've changed;
 *  - otherwise reuses the existing session untouched.
 *
 * Auth is resolved by the underlying {@link startRemoteProxySession} — by
 * default via the env-var/OAuth resolver, so a top-level CLI's discovered token
 * is reused and refreshed mid-run.
 *
 * @returns the session data, or `null` when the worker defines no remote bindings.
 */
export async function maybeStartOrUpdateRemoteProxySession(
	worker: RemoteProxyWorker,
	preExisting?: RemoteProxySessionData | null,
	options?: MaybeStartOrUpdateRemoteProxySessionOptions
): Promise<RemoteProxySessionData | null> {
	const remoteBindings = pickRemoteBindings(worker.bindings);

	let session = preExisting?.session;

	if (Object.keys(remoteBindings).length === 0) {
		if (session) {
			await session.dispose();
		}
		return null;
	}

	if (!session) {
		session = await startRemoteProxySession(remoteBindings, {
			workerName: worker.name,
			accountId: worker.accountId,
			complianceRegion: worker.complianceRegion,
			auth: options?.auth,
			logger: options?.logger,
		});
	} else if (!bindingsEqual(remoteBindings, preExisting?.remoteBindings)) {
		await session.updateBindings(remoteBindings);
	}

	await session.ready;

	return { session, remoteBindings };
}
