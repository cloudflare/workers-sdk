import type { Binding } from "@cloudflare/workers-utils";
import type { RemoteProxyConnectionString } from "miniflare";

export type { Binding } from "@cloudflare/workers-utils";
export type { RemoteProxyConnectionString } from "miniflare";

/**
 * API credentials — either a bearer token or a global API key + email.
 */
export type ApiCredentials =
	| { apiToken: string }
	| { authKey: string; authEmail: string };

/**
 * Credentials for authenticating with the Cloudflare API.
 */
export interface AuthCredentials {
	accountId: string;
	apiToken: ApiCredentials;
}

/**
 * Options for starting a remote proxy session.
 */
export interface StartRemoteProxySessionOptions {
	/** The name of the worker (used as the preview session name). */
	workerName?: string;
	/** Auth credentials, or a callback that resolves them lazily. */
	auth: AuthCredentials | (() => Promise<AuthCredentials>);
	/** If running in a non-public compliance region (e.g., "eu"), set this here. */
	complianceRegion?: string;
	/**
	 * Optional logger for debug output during preview session creation.
	 * Pass wrangler's `logger`, `console`, or omit for silent operation.
	 */
	logger?: { debug(...args: unknown[]): void };
}

/**
 * A running remote proxy session that provides a connection string
 * for miniflare to use when proxying binding requests to the edge.
 */
export interface RemoteProxySession {
	/** Resolves when the session is ready to accept requests. */
	ready: Promise<void>;
	/** The connection string URL for miniflare plugins to use. */
	remoteProxyConnectionString: RemoteProxyConnectionString;
	/** Update the bindings for this session (e.g., after config change). */
	updateBindings: (bindings: Record<string, Binding>) => Promise<void>;
	/** Tear down the session and release resources. */
	dispose: () => Promise<void>;
}

/**
 * A Cloudflare edge preview session.
 */
export interface PreviewSession {
	/** The session token for creating preview tokens. */
	value: string;
	/** The host where the preview is available. */
	host: string;
	/** The worker name used when the session was created. */
	name: string | undefined;
}

/**
 * A preview token for authenticating requests to the edge worker.
 */
export interface PreviewToken {
	/** The header value for `cf-workers-preview-token`. */
	value: string;
	/** The host where the preview is available. */
	host: string;
}
