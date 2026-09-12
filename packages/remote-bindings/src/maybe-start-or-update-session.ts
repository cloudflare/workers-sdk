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
	 * present *these* to authenticate through the proxy. Fetched here, once per
	 * session, so that every consumer of a session — `wrangler dev`,
	 * `getPlatformProxy()`, the Vite plugin, `vitest-pool-workers` — receives
	 * usable credentials without repeating the setup.
	 */
	hyperdriveConnectionStrings: Map<string, string>;
};

export type RemoteBindingsContext = {
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

// Tracks the keepalive timer already installed for a session, so repeated
// calls to `maybeStartOrUpdateRemoteProxySession` that reuse the same
// session (auth and bindings unchanged) don't stack up duplicate timers.
// Keyed by the session object itself so it's automatically dropped once the
// session is no longer reachable — this is a background convenience, not a
// substitute for clearing the interval on `dispose()`.
const hyperdriveKeepalives = new WeakSet<RemoteProxySession>();

/**
 * Installs a periodic Hyperdrive credential keepalive for a session, unless
 * one is already running or the session has no remote Hyperdrive bindings.
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
	if (hyperdriveKeepalives.has(session)) {
		return;
	}
	const hasRemoteHyperdrive = Object.values(bindings ?? {}).some(
		(binding) =>
			binding.type === "hyperdrive" &&
			"remote" in binding &&
			Boolean(binding.remote)
	);
	if (!hasRemoteHyperdrive) {
		return;
	}

	hyperdriveKeepalives.add(session);
	const timer = setInterval(() => {
		seedRemoteHyperdriveBindings(
			bindings,
			session.remoteProxyConnectionString
		).catch((error) => {
			logger.debug(
				`Failed to refresh remote Hyperdrive credentials; will retry on the next interval: ${
					error instanceof Error ? error.message : String(error)
				}`
			);
		});
	}, HYPERDRIVE_KEEPALIVE_INTERVAL_MS).unref();

	const originalDispose = session.dispose.bind(session);
	session.dispose = async () => {
		clearInterval(timer);
		await originalDispose();
	};
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
	return {
		session: remoteProxySession,
		remoteBindings,
		auth,
		hyperdriveConnectionStrings: await seedRemoteHyperdriveBindings(
			workerConfigObject.bindings,
			remoteProxySession.remoteProxyConnectionString
		),
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
