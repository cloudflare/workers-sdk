import { randomUUID } from "node:crypto";
import {
	createProxyWorkerOptions,
	createRemoteModeProxyData,
	PREVIEW_TOKEN_REFRESH_INTERVAL,
	sendProxyWorkerMessage,
} from "@cloudflare/dev-proxy";
import { getAccessHeaders } from "@cloudflare/workers-auth";
import { Log, LogLevel, Miniflare } from "miniflare";
import proxyServerWorkerScript from "virtual:proxy-server-worker";
import { createEnvAuthResolver } from "./auth";
import {
	createPreviewSession,
	createWorkerPreview,
} from "./create-worker-preview";
import type {
	CfAccount,
	CfPreviewSession,
	CfPreviewToken,
} from "./create-worker-preview";
import type { Logger } from "./logger";
import type {
	AuthCredentials,
	RemoteProxySession,
	StartRemoteProxySessionOptions,
} from "./types";
import type { ProxyWorkerOutgoingRequestBody } from "@cloudflare/dev-proxy";
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
 *    obtain a preview token (via the shared preview primitives — the same code
 *    path wrangler's dev server uses).
 * 2. Runs the *shared* ProxyWorker (`@cloudflare/dev-proxy`) inside Miniflare,
 *    configured for remote mode exactly as `wrangler dev --remote` configures
 *    it: it injects the preview token and forwards to the edge host. This
 *    reuses wrangler's proven proxy logic rather than reimplementing it.
 * 3. Returns the local Miniflare URL as the `RemoteProxyConnectionString`.
 *
 * The preview token expires after 1 hour; it is refreshed both proactively
 * (at {@link PREVIEW_TOKEN_REFRESH_INTERVAL}) and reactively (when the
 * ProxyWorker reports `previewTokenExpired`), mirroring wrangler's
 * RemoteRuntimeController.
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
	let session: CfPreviewSession;
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

	// The bindings currently proxied; updated by `updateBindings` and re-used
	// when refreshing the (short-lived) preview token.
	let currentBindings = bindings;

	// (Re)upload the ProxyServerWorker for the given bindings and return a fresh
	// preview token. Auth is resolved on every call so refreshed tokens are used.
	async function uploadToken(
		forBindings: Record<string, Binding>
	): Promise<CfPreviewToken> {
		return createWorkerPreview(
			complianceConfig,
			buildProxyWorkerInit(workerName, forBindings),
			toAccount(await resolveAuth()),
			MINIMAL_WORKER_CONTEXT,
			session,
			abortSignal,
			true,
			{ logger }
		);
	}

	// Step 2: Upload the ProxyServerWorker and get the initial preview token
	let token: CfPreviewToken;
	try {
		token = await uploadToken(currentBindings);
	} catch (error) {
		throw new Error("Failed to create remote preview token", {
			cause: error,
		});
	}

	// Step 3: Run the shared ProxyWorker in Miniflare.
	// `authSecret` guards the controller <-> ProxyWorker control channel.
	const authSecret = randomUUID();
	let disposed = false;
	let refreshTimer: ReturnType<typeof setTimeout> | undefined;
	let refreshing: Promise<void> | undefined;

	const mf = new Miniflare({
		log: new Log(LogLevel.WARN),
		host: "127.0.0.1",
		// Let Miniflare pick a free port; the resolved URL becomes the connection string.
		port: 0,
		workers: [
			createProxyWorkerOptions({
				authSecret,
				onMessage: (message) => {
					void onProxyWorkerMessage(message);
				},
			}),
		],
	});

	// Point the ProxyWorker at the edge preview for `token`, using the shared
	// remote-mode ProxyData shape (identical to `wrangler dev --remote`).
	async function play(forToken: CfPreviewToken): Promise<void> {
		const accessHeaders = await getAccessHeaders(forToken.host, {
			logger,
			isNonInteractiveOrCI: () => true,
		});
		const proxyData = createRemoteModeProxyData(forToken, accessHeaders);
		await sendProxyWorkerMessage(mf, authSecret, {
			type: "play",
			proxyData,
		});
	}

	function scheduleRefresh(): void {
		if (disposed) {
			return;
		}
		clearTimeout(refreshTimer);
		refreshTimer = setTimeout(() => {
			void refreshToken();
		}, PREVIEW_TOKEN_REFRESH_INTERVAL);
	}

	// Re-mint the preview token for the current bindings and re-`play`. Serialised
	// so a proactive refresh and a reactive `previewTokenExpired` can't overlap.
	function refreshToken(): Promise<void> {
		if (disposed) {
			return Promise.resolve();
		}
		if (refreshing) {
			return refreshing;
		}
		refreshing = (async () => {
			try {
				token = await uploadToken(currentBindings);
				await play(token);
				scheduleRefresh();
			} catch (error) {
				logger.error("Failed to refresh remote bindings preview token", error);
			} finally {
				refreshing = undefined;
			}
		})();
		return refreshing;
	}

	async function onProxyWorkerMessage(
		message: ProxyWorkerOutgoingRequestBody
	): Promise<void> {
		switch (message.type) {
			case "previewTokenExpired":
				await refreshToken();
				break;
			case "error":
				logger.error("Error inside remote bindings ProxyWorker", message.error);
				break;
			case "debug-log":
				logger.debug("[remote-bindings ProxyWorker]", ...message.args);
				break;
			case "sseResponseDetected":
				break;
		}
	}

	const url = await mf.ready;
	const remoteProxyConnectionString =
		url as unknown as RemoteProxyConnectionString;

	// Kick off the initial proxy configuration + refresh schedule.
	await play(token);
	scheduleRefresh();

	const updateBindings = async (
		newBindings: Record<string, Binding>
	): Promise<void> => {
		try {
			currentBindings = newBindings;
			token = await uploadToken(newBindings);
			await play(token);
			scheduleRefresh();
		} catch (error) {
			throw new Error("Failed to update remote proxy bindings", {
				cause: error,
			});
		}
	};

	const dispose = async (): Promise<void> => {
		disposed = true;
		clearTimeout(refreshTimer);
		await mf.dispose();
	};

	return {
		ready: Promise.resolve(),
		remoteProxyConnectionString,
		updateBindings,
		dispose,
	};
}
