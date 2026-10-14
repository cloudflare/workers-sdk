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

export { HYPERDRIVE_KEEPALIVE_INTERVAL_MS } from "./start-remote-proxy-session";

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
	/** Edge credentials for option assembly, refreshed on every helper call. */
	hyperdriveConnectionStrings: Map<string, string>;
};

export type RemoteBindingsContext = {
	logger: RemoteBindingsLogger;
};

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
		await remoteProxySession?.dispose();
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
	} else if (
		!deepStrictEqual(
			remoteBindings,
			preExistingRemoteProxySessionData?.remoteBindings
		)
	) {
		if (!remoteProxySession) {
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
			await remoteProxySession.updateBindings(remoteBindings);
		}
	}

	if (!remoteProxySession) {
		return null;
	}
	try {
		await remoteProxySession.ready;
	} catch (error) {
		if (remoteProxySession !== preExistingRemoteProxySessionData?.session) {
			await remoteProxySession.dispose().catch(() => {});
		}
		throw error;
	}
	remoteProxySession.updateHyperdriveKeepalive(workerConfigObject.bindings);
	let hyperdriveConnectionStrings: Map<string, string>;
	try {
		hyperdriveConnectionStrings = await seedRemoteHyperdriveBindings(
			workerConfigObject.bindings,
			remoteProxySession.remoteProxyConnectionString
		);
	} catch {
		// Return the handle even on seed failure: the caller owns this session,
		// and a reused session may also serve unrelated KV, R2, or service bindings.
		context.logger.warn(
			"Failed to fetch edge credentials for remote Hyperdrive bindings. Check your authentication and internet connection, then retry."
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
