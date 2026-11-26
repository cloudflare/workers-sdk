import assert from "node:assert";
import { resolveBindingRemote } from "@cloudflare/workers-utils/config";
import { getRemoteBindings } from "./config-bindings";
import { startRemoteProxySession } from "./start-remote-proxy-session";
import type { ConfigBindings } from "./config-bindings";
import type { RemoteBindingsLogger } from "./logger";
import type { RemoteProxySession } from "./start-remote-proxy-session";
import type { RemoteBindingsCliDisplayName } from "./utils/remote";
import type {
	AsyncHook,
	Binding,
	CfAccount,
	StartDevWorkerInput,
} from "@cloudflare/workers-utils";
import type { Config } from "@cloudflare/workers-utils/config";

export function pickRemoteBindings(
	bindings: Record<string, Binding>
): Record<string, Binding> {
	return Object.fromEntries(
		Object.entries(bindings ?? {}).filter(([, binding]) =>
			resolveBindingRemote(
				binding.type,
				"remote" in binding ? binding.remote : undefined
			)
		)
	);
}

export type WorkerConfigObject = {
	/** The name of the worker. */
	name?: string;
	/** If running in a non-public compliance region, set this here. */
	complianceRegion?: Config["compliance_region"];
} & (
	| {
			/** The format of the Worker's bindings. Defaults to Wrangler's. */
			target?: "wrangler";
			/** The Worker's bindings, in Wrangler's format. */
			bindings: NonNullable<StartDevWorkerInput["bindings"]>;
	  }
	| {
			/** The format of the Worker's bindings: `cloudflare.config.ts`'s. */
			target: "cf";
			/** The Worker's bindings, as declared in `cloudflare.config.ts`. */
			env: ConfigBindings;
	  }
);

/** Credentials for a remote proxy session. */
export type RemoteBindingsAuth = {
	/** Resolves the account ID and API token for the session. */
	hook: AsyncHook<CfAccount>;
	/**
	 * Identifies the credentials `hook` resolves. When set, a session is only
	 * restarted when the key changes; otherwise, when it gets a different `hook`.
	 */
	key?: string;
};

export type RemoteProxySessionData = {
	session: RemoteProxySession;
	remoteBindings: Record<string, Binding>;
	auth?: AsyncHook<CfAccount>;
	authKey?: string;
};

export type RemoteBindingsContext = {
	cliDisplayName: RemoteBindingsCliDisplayName;
	logger: RemoteBindingsLogger;
};

/** Starts or updates a remote proxy session that connects on the first binding call. */
export async function maybeStartOrUpdateRemoteProxySession(
	workerConfigObject: WorkerConfigObject,
	preExistingRemoteProxySessionData: RemoteProxySessionData | null | undefined,
	auth: RemoteBindingsAuth | AsyncHook<CfAccount>,
	context: RemoteBindingsContext,
	startSession: typeof startRemoteProxySession = startRemoteProxySession
): Promise<RemoteProxySessionData | null> {
	// Wrangler passes its hook alone
	const { hook, key }: RemoteBindingsAuth =
		"hook" in auth ? auth : { hook: auth };
	// The remote proxy Worker takes bindings in Wrangler's format.
	const bindings =
		workerConfigObject.target === "cf"
			? getRemoteBindings({ env: workerConfigObject.env })
			: workerConfigObject.bindings;
	const remoteBindings = pickRemoteBindings(bindings);
	if (
		Object.keys(remoteBindings).length === 0 &&
		!preExistingRemoteProxySessionData?.session
	) {
		return null;
	}
	const authSameAsBefore =
		key !== undefined ||
		preExistingRemoteProxySessionData?.authKey !== undefined
			? key === preExistingRemoteProxySessionData?.authKey
			: deepStrictEqual(hook, preExistingRemoteProxySessionData?.auth);
	let remoteProxySession = preExistingRemoteProxySessionData?.session;

	if (!remoteProxySession || !authSameAsBefore) {
		await remoteProxySession?.dispose();
		remoteProxySession = await startSession(remoteBindings, {
			workerName: workerConfigObject.name,
			complianceRegion: workerConfigObject.complianceRegion,
			cliDisplayName: context.cliDisplayName,
			auth: hook,
			lazy: true,
			logger: context.logger,
		});
	} else if (
		!deepStrictEqual(
			remoteBindings,
			preExistingRemoteProxySessionData?.remoteBindings
		)
	) {
		await remoteProxySession.updateBindings(remoteBindings);
	}

	await remoteProxySession.ready;
	return {
		session: remoteProxySession,
		remoteBindings,
		auth: hook,
		authKey: key,
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
