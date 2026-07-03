import getPort from "get-port";
import proxyServerWorkerScript from "virtual:proxy-server-worker";
import { createEnvAuthResolver } from "./auth";
import {
	createPreviewSession,
	createWorkerPreview,
} from "./create-worker-preview";
import { ProxyServer } from "./proxy-server";
import type { CfAccount } from "./create-worker-preview";
import type { Logger } from "./logger";
import type {
	AuthCredentials,
	RemoteProxySession,
	StartRemoteProxySessionOptions,
} from "./types";
import type {
	Binding,
	CfWorkerContext,
	CfWorkerInitWithName,
	ComplianceConfig,
} from "@cloudflare/workers-utils";
import type { RemoteProxyConnectionString } from "miniflare";

/** The compatibility date the ProxyServerWorker is uploaded with. */
const PROXY_WORKER_COMPATIBILITY_DATE = "2025-04-28";

/**
 * Normalise the `auth` option into a resolver that is invoked *fresh on every*
 * Cloudflare API call.
 *
 * This is essential for long-lived sessions (e.g. `vite dev`): when the resolver
 * is backed by {@link createEnvAuthResolver} it re-reads (and refreshes, if
 * expired) the stored OAuth token on each call, so a token rotated on disk by
 * the top-level CLI — or by this resolver itself — is always picked up. A
 * resolver that resolved auth only once would send a stale token after the
 * original expired.
 */
function toAuthResolver(
	auth: StartRemoteProxySessionOptions["auth"],
	accountId: string | undefined,
	logger: Logger
): () => Promise<AuthCredentials> {
	if (auth === undefined) {
		return createEnvAuthResolver({ accountId, logger });
	}
	if (typeof auth === "function") {
		return auth;
	}
	return async () => auth;
}

/** Map resolved {@link AuthCredentials} into the {@link CfAccount} shape. */
function toAccount(credentials: AuthCredentials): CfAccount {
	return {
		accountId: credentials.accountId,
		apiToken: credentials.apiToken,
	};
}

/**
 * A minimal {@link CfWorkerContext} for a workers.dev preview: no zone, no
 * routes and no service environments, so the preview upload runs in
 * `workers_dev` + `minimal_mode` (raw pass-through bindings).
 */
const MINIMAL_WORKER_CONTEXT: CfWorkerContext = {
	env: undefined,
	useServiceEnvironments: false,
	zone: undefined,
	host: undefined,
	routes: undefined,
	sendMetrics: false,
};

/**
 * Build the {@link CfWorkerInitWithName} for the pre-bundled ProxyServerWorker.
 * All bindings are marked `raw` so the edge gives the proxy worker direct,
 * pass-through access to the real resources.
 */
function buildProxyWorkerInit(
	workerName: string,
	bindings: Record<string, Binding>
): CfWorkerInitWithName {
	const rawBindings: Record<string, Binding> = {};
	for (const [name, binding] of Object.entries(bindings)) {
		rawBindings[name] = { ...binding, raw: true } as Binding;
	}

	return {
		name: workerName,
		main: {
			name: "ProxyServerWorker.mjs",
			filePath: "ProxyServerWorker.mjs",
			type: "esm",
			content: proxyServerWorkerScript,
		},
		bindings: rawBindings,
		modules: [],
		sourceMaps: undefined,
		containers: undefined,
		migrations: undefined,
		exports: undefined,
		compatibility_date: PROXY_WORKER_COMPATIBILITY_DATE,
		compatibility_flags: [],
		keepVars: undefined,
		keepSecrets: undefined,
		keepBindings: undefined,
		logpush: undefined,
		placement: undefined,
		tail_consumers: undefined,
		limits: undefined,
		assets: undefined,
		observability: undefined,
		cache: undefined,
	};
}

/**
 * Start a remote proxy session.
 *
 * 1. Creates an edge-preview session and uploads the ProxyServerWorker to
 *    obtain a preview token (via the shared `@cloudflare/remote-bindings`
 *    preview primitives — the same code path wrangler's dev server uses).
 * 2. Starts a minimal Node.js HTTP/WS proxy that injects the preview token.
 * 3. Returns the local proxy URL as the `RemoteProxyConnectionString`.
 */
export async function startRemoteProxySession(
	bindings: Record<string, Binding>,
	options: StartRemoteProxySessionOptions = {}
): Promise<RemoteProxySession> {
	if (Object.keys(bindings).length === 0) {
		throw new Error("Cannot start remote proxy session with no bindings");
	}

	const logger: Logger = options.logger ?? console;
	const resolveAuth = toAuthResolver(options.auth, options.accountId, logger);
	const workerName = options.workerName ?? "remote-bindings-proxy";
	const complianceConfig: ComplianceConfig = {
		compliance_region:
			options.complianceRegion as ComplianceConfig["compliance_region"],
	};
	// A never-aborting signal; the preview API calls apply their own timeout.
	const abortSignal = new AbortController().signal;

	// Step 1: Create a preview session (gets a session token, exchanges if needed)
	let session;
	try {
		session = await createPreviewSession(
			complianceConfig,
			toAccount(await resolveAuth()),
			MINIMAL_WORKER_CONTEXT,
			abortSignal,
			workerName,
			{ logger }
		);
	} catch (error) {
		throw new Error("Failed to create remote preview session", {
			cause: error,
		});
	}

	// Step 2: Upload the ProxyServerWorker and get a preview token
	let token;
	try {
		token = await createWorkerPreview(
			complianceConfig,
			buildProxyWorkerInit(workerName, bindings),
			toAccount(await resolveAuth()),
			MINIMAL_WORKER_CONTEXT,
			session,
			abortSignal,
			true,
			{ logger }
		);
	} catch (error) {
		throw new Error("Failed to create remote preview token", {
			cause: error,
		});
	}

	// Step 3: Start a minimal local proxy that injects the preview token
	const port = await getPort();
	const proxy = new ProxyServer(token, port);
	await proxy.ready;

	const remoteProxyConnectionString = new URL(
		proxy.url
	) as RemoteProxyConnectionString;

	// updateBindings: re-upload the worker with new bindings and refresh the token
	const updateBindings = async (
		newBindings: Record<string, Binding>
	): Promise<void> => {
		try {
			const newToken = await createWorkerPreview(
				complianceConfig,
				buildProxyWorkerInit(workerName, newBindings),
				toAccount(await resolveAuth()),
				MINIMAL_WORKER_CONTEXT,
				session,
				abortSignal,
				true,
				{ logger }
			);
			proxy.setToken(newToken);
		} catch (error) {
			throw new Error("Failed to update remote proxy bindings", {
				cause: error,
			});
		}
	};

	const dispose = async (): Promise<void> => {
		await proxy.dispose();
	};

	return {
		ready: proxy.ready,
		remoteProxyConnectionString,
		updateBindings,
		dispose,
	};
}
