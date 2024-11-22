import { logger } from "../logger";
import { getMetricsDispatcher } from "./metrics-dispatcher";
import type { MetricsConfigOptions } from "./metrics-config";
import type { Properties } from "./metrics-dispatcher";

/** These are event names used by this wrangler client. */
export type EventNames =
	| "view accounts"
	| "deploy worker script"
	| "delete worker script"
	| "begin log stream"
	| "end log stream"
	| "begin pages log stream"
	| "end pages log stream"
	| "create encrypted variable"
	| "delete encrypted variable"
	| "list encrypted variables"
	| "create pages encrypted variable"
	| "delete pages encrypted variable"
	| "list pages encrypted variables"
	| "create kv namespace"
	| "list kv namespaces"
	| "delete kv namespace"
	| "write kv key-value"
	| "write kv key-value (local)"
	| "list kv keys"
	| "list kv keys (local)"
	| "read kv value"
	| "read kv value (local)"
	| "delete kv key-value"
	| "delete kv key-value (local)"
	| "write kv key-values (bulk)"
	| "write kv key-values (bulk) (local)"
	| "delete kv key-values (bulk)"
	| "delete kv key-values (bulk) (local)"
	| "create r2 bucket"
	| "list r2 buckets"
	| "delete r2 bucket"
	| "login user"
	| "logout user"
	| "create pubsub namespace"
	| "list pubsub namespaces"
	| "delete pubsub namespace"
	| "view pubsub namespace"
	| "create pubsub broker"
	| "update pubsub broker"
	| "list pubsub brokers"
	| "delete pubsub broker"
	| "view pubsub broker"
	| "issue pubsub broker credentials"
	| "revoke pubsub broker credentials"
	| "unrevoke pubsub broker credentials"
	| "list pubsub broker revoked credentials"
	| "list pubsub broker public-keys"
	| "list dispatch namespaces"
	| "view dispatch namespace"
	| "create dispatch namespace"
	| "delete dispatch namespace"
	| "rename dispatch namespace"
	| "create pages project"
	| "list pages projects"
	| "create pages deployment"
	| "list pages deployments"
	| "build pages functions"
	| "run dev"
	| "run dev (api)"
	| "run pages dev"
	| "view docs"
	| "view deployments"
	| "rollback deployments"
	| "upload worker version"
	| "deploy worker versions"
	| "view worker version"
	| "list worker versions"
	| "view versioned deployment"
	| "view latest versioned deployment"
	| "list versioned deployments"
	| "download pages config"
	| "deploy worker triggers"
	| "create pipeline"
	| "list pipelines"
	| "delete pipeline"
	| "update pipeline"
	| "show pipeline";

/**
 * Send a metrics event, with no extra properties, to Cloudflare, if usage tracking is enabled.
 *
 * This overload assumes that you do not want to configure analytics with options.
 */
export function sendMetricsEvent(event: EventNames): Promise<void>;
/**
 * Send a metrics event, with no extra properties, to Cloudflare, if usage tracking is enabled.
 */
export function sendMetricsEvent(
	event: EventNames,
	options: MetricsConfigOptions
): Promise<void>;
/**
 * Send a metrics event to Cloudflare, if usage tracking is enabled.
 *
 * Generally you should pass the `send_metrics` property from the wrangler.toml config here,
 * which would override any user permissions.
 */
export function sendMetricsEvent(
	event: EventNames,
	properties: Properties,
	options: MetricsConfigOptions
): Promise<void>;
export async function sendMetricsEvent(
	event: EventNames,
	...args: [] | [MetricsConfigOptions] | [Properties, MetricsConfigOptions]
): Promise<void> {
	try {
		const options = args.pop() ?? {};
		const properties = (args.pop() ?? {}) as Properties;
		const metricsDispatcher = await getMetricsDispatcher(options);
		await metricsDispatcher.sendEvent(event, properties);
	} catch (err) {
		logger.debug("Error sending metrics event", err);
	}
}

export type CommonEventProperties = {
	/** The version of the wrangler client that is sending the event. */
	wranglerVersion: string;
	/**
	 * The platform that the wrangler client is running on.
	 */
	platform: string;
	/**
	 * The package manager that the wrangler client is using.
	 */
	packageManager: string | undefined;
	/**
	 * Whether this is the first time the user has used the wrangler client.
	 */
	isFirstUsage: boolean;

	amplitude_session_id: number;
	amplitude_event_id: number;

	isCI: boolean;
	isInteractive: boolean;
	argsUsed: string[];
	argsCombination: string;
};

export type Events =
	| {
			name: "wrangler command started";
			properties: CommonEventProperties & {
				command: string;
				args: Record<string, unknown>;
			};
	  }
	| {
			name: "wrangler command completed";
			properties: CommonEventProperties & {
				command: string | undefined;
				args: Record<string, unknown> | undefined;
				durationMs: number;
				durationMinutes: number;
				durationSeconds: number;
			};
	  }
	| {
			name: "wrangler command errored";
			properties: CommonEventProperties & {
				command: string | undefined;
				args: Record<string, unknown> | undefined;
				durationMs: number;
				durationMinutes: number;
				durationSeconds: number;
				errorType: string | undefined;
			};
	  };
