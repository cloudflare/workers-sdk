import assert from "node:assert";
import { getBindingLocalSupport } from "@cloudflare/workers-utils";
import { getRemoteBindingsAuthHook } from "./auth";
import { seedRemoteHyperdriveBindings } from "./seed-hyperdrive-bindings";
import { startRemoteProxySession } from "./start-remote-proxy-session";
import type { RemoteBindingsLogger } from "./logger";
import type { RemoteProxySession } from "./start-remote-proxy-session";
import type {
	AsyncHook,
	Binding,
	CfAccount,
	Config,
	StartDevWorkerInput,
} from "@cloudflare/workers-utils";

export function pickRemoteBindings(
	bindings: Record<string, Binding>
): Record<string, Binding> {
	return Object.fromEntries(
		Object.entries(bindings ?? {}).filter(([, binding]) => {
			if (
				getBindingLocalSupport(binding.type) ===
				"DO-NOT-USE-this-resource-will-never-have-a-local-simulator"
			) {
				return true;
			}
			return "remote" in binding && binding.remote;
		})
	);
}

export type WorkerConfigObject = {
	/** The name of the worker. */
	name?: string;
	/** The Worker's bindings. */
	bindings: NonNullable<StartDevWorkerInput["bindings"]>;
	/** If running in a non-public compliance region, set this here. */
	complianceRegion?: Config["compliance_region"];
	/** ID of the account owning the worker. */
	account_id?: Config["account_id"];
	/** Directory used to resolve the auth profile from directory bindings. */
	profileDir?: string;
};

export type RemoteProxySessionData = {
	session: RemoteProxySession;
	remoteBindings: Record<string, Binding>;
	auth?: AsyncHook<CfAccount>;
	/**
	 * Edge connection strings for remote Hyperdrive bindings, keyed by binding
	 * name. The edge mints per-session credentials, so a database client has to
	 * present *these* to authenticate through the proxy. Fetched here, on every
	 * call — including the reloads that reuse an existing session, since each
	 * fetch has to come from a live connection — so that every consumer of a
	 * session (`wrangler dev`, `getPlatformProxy()`, the Vite plugin,
	 * `vitest-pool-workers`) receives usable credentials without repeating the
	 * setup.
	 */
	hyperdriveConnectionStrings: Map<string, string>;
};

export type RemoteBindingsContext = {
	cliDisplayName: string;
	logger: RemoteBindingsLogger;
};

/**
 * How often a session with remote Hyperdrive bindings re-fetches its edge
 * connection strings for as long as the session lives, purely to keep the
 * edge's per-session credential state alive.
 *
 * Most consumers re-derive credentials incidentally: `wrangler dev` and
 * `vitest-pool-workers` call {@link maybeStartOrUpdateRemoteProxySession}
 * again on every file-triggered reload, and that already re-seeds. But
 * `getPlatformProxy()` builds one session for the life of the host process
 * and never calls this again, so a long-idle session (observed empirically
 * to be roughly 5-8 hours) has the edge start rejecting connections with no
 * survivor to fix it short of a full restart. This is a conservative
 * interval chosen to sit well under that window.
 */
export const HYPERDRIVE_KEEPALIVE_INTERVAL_MS = 20 * 60 * 1000;

/**
 * A session's running Hyperdrive keepalive.
 *
 * `bindings` is re-read on every tick rather than captured once: a session
 * outlives the reloads that reuse it, and the set of remote Hyperdrive
 * bindings can change between them. A timer closed over the set from its
 * first installation would keep refreshing bindings that no longer exist and
 * never refresh the ones that replaced them — reviving the very expiry this
 * keepalive exists to prevent.
 *
 * `timer` is `undefined` while no remote Hyperdrive binding is configured.
 * The record itself outlives that gap so `dispose` only ever needs patching
 * once, however many times bindings come and go.
 */
type HyperdriveKeepalive = {
	bindings: StartDevWorkerInput["bindings"];
	timer: ReturnType<typeof setInterval> | undefined;
};

// Keyed by the session object so a record is dropped once its session is
// unreachable. That is a backstop, not the mechanism: the interval is cleared
// in the patched `dispose()` below.
const hyperdriveKeepalives = new WeakMap<
	RemoteProxySession,
	HyperdriveKeepalive
>();

function hasRemoteHyperdriveBinding(
	bindings: StartDevWorkerInput["bindings"]
): boolean {
	return Object.values(bindings ?? {}).some(
		(binding) =>
			binding.type === "hyperdrive" &&
			"remote" in binding &&
			Boolean(binding.remote)
	);
}

/**
 * Starts, retargets, or stops a session's periodic Hyperdrive credential
 * keepalive so that it always reflects the bindings this call was given.
 *
 * This re-runs the same fetch used to seed credentials at session start,
 * discarding the result — it exists purely to keep the edge's per-session
 * credential state alive, not to hand a caller a fresh value. Callers that
 * already hold a `getPlatformProxy()`-style static `env` snapshot have no
 * way to receive an updated value anyway, and re-plumbing one into an
 * already-constructed `Miniflare` instance via `setOptions()` poisons every
 * binding proxy that instance has already handed out — so this
 * deliberately never touches the consumer-facing Miniflare instance or its
 * bindings, only the session's own connection to the edge.
 */
function ensureHyperdriveKeepalive(
	session: RemoteProxySession,
	bindings: StartDevWorkerInput["bindings"],
	logger: RemoteBindingsLogger
): void {
	const wanted = hasRemoteHyperdriveBinding(bindings);
	const existing = hyperdriveKeepalives.get(session);

	if (existing) {
		existing.bindings = bindings;
		if (!wanted) {
			// Every remote Hyperdrive binding is gone; there is nothing left at the
			// edge to keep warm. Stop ticking, but keep the record so a binding
			// added later restarts the timer without patching `dispose` again.
			clearInterval(existing.timer);
			existing.timer = undefined;
		} else if (existing.timer === undefined) {
			existing.timer = startKeepaliveTimer(session, existing, logger);
		}
		return;
	}

	if (!wanted) {
		return;
	}

	const record: HyperdriveKeepalive = { bindings, timer: undefined };
	record.timer = startKeepaliveTimer(session, record, logger);
	hyperdriveKeepalives.set(session, record);

	const originalDispose = session.dispose.bind(session);
	session.dispose = async () => {
		clearInterval(record.timer);
		record.timer = undefined;
		await originalDispose();
	};
}

function startKeepaliveTimer(
	session: RemoteProxySession,
	record: HyperdriveKeepalive,
	logger: RemoteBindingsLogger
): ReturnType<typeof setInterval> {
	const timer = setInterval(() => {
		seedRemoteHyperdriveBindings(
			record.bindings,
			session.remoteProxyConnectionString
		).catch((error) => {
			logger.debug(
				`Failed to refresh remote Hyperdrive credentials; will retry on the next interval: ${
					error instanceof Error ? error.message : String(error)
				}`
			);
		});
	}, HYPERDRIVE_KEEPALIVE_INTERVAL_MS);
	timer.unref();
	return timer;
}

/** Potentially starts or updates a remote proxy session. */
export async function maybeStartOrUpdateRemoteProxySession(
	workerConfigObject: WorkerConfigObject,
	preExistingRemoteProxySessionData: RemoteProxySessionData | null | undefined,
	auth: AsyncHook<CfAccount> | undefined,
	context: RemoteBindingsContext,
	startSession: typeof startRemoteProxySession = startRemoteProxySession
): Promise<RemoteProxySessionData | null> {
	const remoteBindings = pickRemoteBindings(workerConfigObject.bindings);
	if (
		Object.keys(remoteBindings).length === 0 &&
		!preExistingRemoteProxySessionData?.session
	) {
		return null;
	}
	const authSameAsBefore = deepStrictEqual(
		auth,
		preExistingRemoteProxySessionData?.auth
	);
	let remoteProxySession = preExistingRemoteProxySessionData?.session;

	if (!authSameAsBefore) {
		if (preExistingRemoteProxySessionData?.session) {
			await preExistingRemoteProxySessionData.session.dispose();
		}

		remoteProxySession = await startSession(remoteBindings, {
			workerName: workerConfigObject.name,
			complianceRegion: workerConfigObject.complianceRegion,
			cliDisplayName: context.cliDisplayName,
			auth: getRemoteBindingsAuthHook(
				auth,
				workerConfigObject.account_id,
				workerConfigObject.profileDir,
				context.logger
			),
			logger: context.logger,
		});
	} else {
		const remoteBindingsAreSameAsBefore = deepStrictEqual(
			remoteBindings,
			preExistingRemoteProxySessionData?.remoteBindings
		);

		if (!remoteBindingsAreSameAsBefore) {
			if (!remoteProxySession) {
				if (Object.keys(remoteBindings).length > 0) {
					remoteProxySession = await startSession(remoteBindings, {
						workerName: workerConfigObject.name,
						complianceRegion: workerConfigObject.complianceRegion,
						cliDisplayName: context.cliDisplayName,
						auth: getRemoteBindingsAuthHook(
							auth,
							workerConfigObject.account_id,
							workerConfigObject.profileDir,
							context.logger
						),
						logger: context.logger,
					});
				}
			} else {
				await remoteProxySession.updateBindings(remoteBindings);
			}
		}
	}

	await remoteProxySession?.ready;
	if (!remoteProxySession) {
		return null;
	}
	ensureHyperdriveKeepalive(
		remoteProxySession,
		workerConfigObject.bindings,
		context.logger
	);
	let hyperdriveConnectionStrings: Map<string, string>;
	try {
		hyperdriveConnectionStrings = await seedRemoteHyperdriveBindings(
			workerConfigObject.bindings,
			remoteProxySession.remoteProxyConnectionString
		);
	} catch (error) {
		// Seeding can reject on a WebSocket error, a missing header, or its
		// timeout. Letting that propagate would throw *after* the session is
		// live, so the caller never receives the handle it would need to dispose
		// it — the session leaks. Disposing it here instead is no better: the
		// session is shared with every other remote binding in this worker, so
		// tearing it down over a Hyperdrive-only failure would take unrelated
		// service, KV, and R2 bindings down with it.
		//
		// Warn and carry on with no credentials. The Hyperdrive bindings are
		// degraded for this round — `buildMiniflareBindingOptions` warns again
		// per binding, and a reload re-enters this function and retries the
		// seed — but the session stays owned by the caller and usable by
		// everything else.
		context.logger.warn(
			`Failed to fetch edge credentials for remote Hyperdrive bindings: ${
				error instanceof Error ? error.message : String(error)
			}`
		);
		hyperdriveConnectionStrings = new Map();
	}

	return {
		session: remoteProxySession,
		remoteBindings,
		auth,
		hyperdriveConnectionStrings,
	};
}

function deepStrictEqual(source: unknown, target: unknown): boolean {
	try {
		assert.deepStrictEqual(source, target);
		return true;
	} catch {
		return false;
	}
}
