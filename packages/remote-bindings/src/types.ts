import type { Logger } from "./logger";
import type { ApiCredentials, Binding } from "@cloudflare/workers-utils";
import type { RemoteProxyConnectionString } from "miniflare";

export type { ApiCredentials, Binding } from "@cloudflare/workers-utils";
export type { RemoteProxyConnectionString } from "miniflare";

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
	/**
	 * Auth credentials, or a callback that resolves them lazily.
	 *
	 * When omitted, the package falls back to the built-in env-var/OAuth
	 * resolver ({@link import("./auth").createEnvAuthResolver}), which reads
	 * `CLOUDFLARE_*` credentials or refreshes the stored OAuth token discovered
	 * via the global config directory. The resolver is invoked on every API call
	 * so refreshed tokens are picked up mid-run.
	 */
	auth?: AuthCredentials | (() => Promise<AuthCredentials>);
	/**
	 * Account ID hint for the built-in resolver (used only when `auth` is
	 * omitted). Falls back to `CLOUDFLARE_ACCOUNT_ID` when unset.
	 */
	accountId?: string;
	/** If running in a non-public compliance region (e.g., "eu"), set this here. */
	complianceRegion?: string;
	/**
	 * Optional logger (e.g. `console`, or a CLI's logger). Defaults to `console`.
	 */
	logger?: Logger;
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
