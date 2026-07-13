import assert from "node:assert";
import { getBindingLocalSupport } from "@cloudflare/workers-utils/binding-local-support";
import type { RemoteBindingsLogger } from "../logger";
import type { RemoteProxySession } from "./start-remote-proxy-session";
import type {
	AsyncHook,
	Binding,
	CfAccount,
	Config,
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

export type RemoteProxyWorker = {
	name?: string;
	bindings: Record<string, Binding>;
	complianceRegion?: Config["compliance_region"];
	accountId?: Config["account_id"];
	/** Directory used to resolve auth profile directory bindings. */
	profileDir?: string;
};

export interface MaybeStartOrUpdateRemoteProxySessionOptions {
	auth?: AsyncHook<CfAccount>;
	logger?: RemoteBindingsLogger;
}

export async function maybeStartOrUpdateRemoteProxySession(
	worker: RemoteProxyWorker,
	preExistingRemoteProxySessionData?: {
		session: RemoteProxySession;
		remoteBindings: Record<string, Binding>;
		auth?: AsyncHook<CfAccount>;
	} | null,
	options: MaybeStartOrUpdateRemoteProxySessionOptions = {}
): Promise<{
	session: RemoteProxySession;
	remoteBindings: Record<string, Binding>;
	auth?: AsyncHook<CfAccount>;
} | null> {
	const { auth, logger } = options;
	const remoteBindings = pickRemoteBindings(worker.bindings);
	const hasRemoteBindings = Object.keys(remoteBindings).length > 0;
	if (!hasRemoteBindings && !preExistingRemoteProxySessionData?.session) {
		return null;
	}

	const authSameAsBefore = deepStrictEqual(
		auth,
		preExistingRemoteProxySessionData?.auth
	);
	let remoteProxySession = preExistingRemoteProxySessionData?.session;

	if (!authSameAsBefore) {
		await preExistingRemoteProxySessionData?.session.dispose();
		remoteProxySession = await startWorkerRemoteProxySession(
			remoteBindings,
			worker,
			auth,
			logger
		);
	} else if (
		!deepStrictEqual(
			remoteBindings,
			preExistingRemoteProxySessionData?.remoteBindings
		)
	) {
		if (remoteProxySession) {
			await remoteProxySession.updateBindings(remoteBindings);
		} else if (hasRemoteBindings) {
			remoteProxySession = await startWorkerRemoteProxySession(
				remoteBindings,
				worker,
				auth,
				logger
			);
		}
	}

	await remoteProxySession?.ready;
	if (!remoteProxySession) {
		return null;
	}
	return { session: remoteProxySession, remoteBindings, auth };
}

async function startWorkerRemoteProxySession(
	remoteBindings: Record<string, Binding>,
	worker: RemoteProxyWorker,
	auth: AsyncHook<CfAccount> | undefined,
	logger: RemoteBindingsLogger | undefined
): Promise<RemoteProxySession> {
	const { startRemoteProxySession } =
		await import("./start-remote-proxy-session");
	return startRemoteProxySession(remoteBindings, {
		workerName: worker.name,
		complianceRegion: worker.complianceRegion,
		accountId: worker.accountId,
		profileDir: worker.profileDir,
		auth,
		logger,
	});
}

function deepStrictEqual(source: unknown, target: unknown): boolean {
	try {
		assert.deepStrictEqual(source, target);
		return true;
	} catch {
		return false;
	}
}
